import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Story, Render, CostEvent } from "../shared/types.js";
import { Store, dataDir } from "./db.js";
import { frame, narration, exec } from "./media.js";
import { bridge, safeFile, mptVersion } from "./moneyprinterturbo.js";
import {
  planShots,
  sourcesFor,
  captionCues,
  alignScriptWords,
  EDITORIAL_STYLE,
  assetMatchesNarration,
  type NarratedScene,
  type CaptionWord,
} from "./editorial-plan.js";
import { shotOverlay, openingHeadline, shotMaterial } from "./editorial-art.js";
import {
  narrationKey,
  digest,
  cachedBytes,
  cacheBytes,
} from "./render-cache.js";
import {
  reserve,
  assemblyCaptions,
  captionDifferences,
  voiceLabel,
  GEMINI_NARRATION_STYLE,
} from "./providers.js";
import { GEMINI_MODEL } from "./pricing.js";
import { now } from "./domain.js";
import {
  assertNarrationScript,
  assertNarrationDuration,
  productionRecord,
  productionIssues,
} from "./production-record.js";
import { renderSourceCards } from "./source-cards.js";
import {
  CAPTION_STYLE,
  VISUAL_STANDARD,
  type ProductionProfile,
  visualLabel,
} from "../shared/visuals.js";
import {
  planEvidenceVisuals,
  visualCoverage,
  visualPlanIssues,
} from "./visual-plan.js";
import {
  renderNativeShot,
  finishNativeVideo,
  NATIVE_VIDEO_VERSION,
} from "./native-video.js";
import { mediaRightsIssues, publicMediaRights } from "./media-rights.js";
import { MEDIA_CONTEXT_REFERENCE } from "./media-context.js";
import {
  checkVideoQuality,
  repairCaptionLayout,
  scanAudio,
  normalizeAudio,
} from "./video-quality.js";
import { QUALITY_STANDARD } from "../shared/quality.js";
import type { QualityReport } from "../shared/quality.js";
import { repairVisualFallbacks } from "./visual-repair.js";

async function probe(file: string) {
  return Number(
    (
      await exec("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file,
      ])
    ).stdout.trim(),
  );
}
export async function renderEditorialVideo(
  story: Story,
  progress: (message: string) => Promise<void>,
  store: Store | undefined,
  options: {
    provider: string;
    captions: string;
    privatePreview: boolean;
    renderer?: "classic" | "moneyprinterturbo";
  },
): Promise<Render> {
  assertNarrationScript(story);
  const renderer = options.renderer || "moneyprinterturbo";
  const rendererVersion =
    renderer === "classic" ? NATIVE_VIDEO_VERSION : mptVersion;
  const relative = `renders/${story.id}/v${story.version}`,
    dir = path.join(dataDir, relative);
  await mkdir(dir, { recursive: true });
  const repairs: QualityReport["repairs"] = [];
  let voiceEvent: CostEvent | undefined, captionEvent: CostEvent | undefined;
  try {
    const checked = new Set<string>();
    const checkAsset = async (asset: Story["assets"][number]) => {
      if (checked.has(asset.id)) return;
      const issues = mediaRightsIssues(
        asset,
        options.privatePreview ? "private-preview" : "public-video",
      );
      if (issues.length) throw new Error(issues[0]);
      if (
        asset.contentHash &&
        digest(await readFile(await safeFile(asset.file))) !== asset.contentHash
      )
        throw new Error(
          "The selected media bytes changed after the rights decision. Review the asset again.",
        );
      checked.add(asset.id);
    };
    const coverCandidate = story.assets.find(
      (a) => a.id === story.segments[0]?.assetId,
    );
    const firstAsset =
      coverCandidate &&
      assetMatchesNarration(coverCandidate, story.segments[0].text)
        ? coverCandidate
        : undefined;
    if (firstAsset) await checkAsset(firstAsset);
    const background = firstAsset
      ? (
          await readFile(await safeFile(firstAsset.poster || firstAsset.file))
        ).toString("base64")
      : undefined;
    for (const [name, height] of [
      ["card", 1350],
      ["story", 1920],
    ] as const)
      await sharp(
        Buffer.from(
          frame(story, 0, height, background, options.privatePreview),
        ),
      )
        .png()
        .toFile(path.join(dir, `${name}.png`));
    const scenes: NarratedScene[] = [];
    const audioFiles: string[] = [];
    let offset = 0;
    for (const [index, segment] of story.segments.entries()) {
      await progress(
        `Narration ${index + 1}/${story.segments.length}: checking saved audio`,
      );
      const wav = path.join(dir, `scene-${index}.wav`),
        key = narrationKey(story, segment.text, options.provider);
      const cached = await cachedBytes("narration", key, "wav");
      if (cached) await writeFile(wav, cached);
      else {
        if (options.provider === "gemini" && !voiceEvent)
          voiceEvent = await reserve(store!, story, "gemini", "narration", 1);
        await narration(
          segment.text,
          wav,
          story,
          store,
          voiceEvent,
          options.provider,
        );
        await cacheBytes("narration", key, "wav", await readFile(wav));
      }
      const duration = await probe(wav);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 90)
        throw new Error(
          "Invalid narration duration; no speech request was retried.",
        );
      scenes.push({
        segmentId: segment.id,
        text: segment.text,
        claimIds: segment.claimIds,
        sourceIds: sourcesFor(story, segment.id).map((s) => s.id),
        start: offset,
        end: offset + duration,
        narrationDuration: duration,
        narrationReused: !!cached,
      });
      audioFiles.push(wav);
      offset += duration;
    }
    if (voiceEvent) {
      voiceEvent.state = "succeeded";
      await store!.finishCost(voiceEvent);
    }
    assertNarrationDuration(offset);
    const audio = path.join(dir, "narration.wav");
    await writeFile(
      path.join(dir, "audio-concat.txt"),
      audioFiles.map((f) => `file '${path.basename(f)}'`).join("\n"),
    );
    await exec(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        path.join(dir, "audio-concat.txt"),
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "1",
        audio,
      ],
      { timeout: 60000 },
    );
    const actual = await probe(audio),
      audioHash = digest(await readFile(audio));
    assertNarrationDuration(actual);
    await progress("Measuring narration levels and silence");
    const originalAudio = await scanAudio(audio, actual);
    if (
      Number.isFinite(originalAudio.lufs) &&
      Number.isFinite(originalAudio.truePeak) &&
      (originalAudio.lufs < QUALITY_STANDARD.minLufs ||
        originalAudio.lufs > QUALITY_STANDARD.maxLufs ||
        originalAudio.truePeak > QUALITY_STANDARD.normalizationTruePeak)
    ) {
      const normalized = path.join(dir, "narration-normalized.wav");
      await normalizeAudio(audio, normalized, originalAudio);
      repairs.push({
        kind: "audio",
        message:
          "Normalized narration once to -16 LUFS / -3.5 dBTP for AAC headroom; original scene audio remains cached. Speech speed and duration unchanged.",
      });
    }
    const masteredAudio = repairs.some((r) => r.kind === "audio")
      ? path.join(dir, "narration-normalized.wav")
      : audio;
    let captionTiming =
        "Estimated word groups within measured scene audio; review against playback.",
      captionWarnings: string[] = [],
      captionReused = false;
    let words: CaptionWord[] = scenes.flatMap((scene) => {
      const words = scene.text.split(/\s+/);
      return words.map((text, i) => ({
        text,
        start:
          1000 * (scene.start + (scene.narrationDuration * i) / words.length),
        end:
          1000 *
          (scene.start + (scene.narrationDuration * (i + 1)) / words.length),
      }));
    });
    if (options.captions === "assemblyai") {
      await progress("Aligning captions to the recorded speech");
      const key = digest(
        JSON.stringify({
          audioHash,
          provider: "assemblyai",
          model: "universal-2",
          language: "en",
          formatText: false,
        }),
      );
      const cached = await cachedBytes("captions", key, "json");
      let transcript: Awaited<ReturnType<typeof assemblyCaptions>>;
      if (cached) {
        transcript = JSON.parse(cached.toString());
        captionReused = true;
      } else {
        captionEvent = await reserve(
          store!,
          story,
          "assemblyai",
          "captions",
          0.1,
        );
        const captionAudio = path.join(dir, "caption-audio.wav");
        await exec(
          "ffmpeg",
          ["-y", "-i", audio, "-ar", "16000", "-ac", "1", captionAudio],
          { timeout: 60000 },
        );
        transcript = await assemblyCaptions(
          store!,
          captionEvent,
          await readFile(captionAudio),
        );
      }
      if (
        transcript.words.some(
          (w, i) =>
            !Number.isFinite(w.start) ||
            !Number.isFinite(w.end) ||
            w.start < 0 ||
            w.end <= w.start ||
            w.end > actual * 1000 + 2000 ||
            (i > 0 && w.start < transcript.words[i - 1].end),
        )
      )
        throw new Error(
          "Speech alignment returned invalid or overlapping word timestamps.",
        );
      if (!cached)
        await cacheBytes(
          "captions",
          key,
          "json",
          Buffer.from(JSON.stringify(transcript)),
        );
      const alignment = alignScriptWords(
        story.segments.map((s) => s.text).join(" "),
        transcript.words,
      );
      words = alignment.words;
      captionWarnings = captionDifferences(
        story.segments.map((s) => s.text).join(" "),
        transcript.words,
      );
      captionTiming =
        "Script spelling aligned to AssemblyAI speech timestamps; transcription differences require playback review.";
      if (alignment.adjustments.length && captionWarnings.length)
        captionWarnings.push(
          `${alignment.adjustments.length} caption span(s) retain script spelling across transcription differences. Check names, numbers and pronunciation against playback.`,
        );
      await writeFile(
        path.join(dir, "transcript.json"),
        JSON.stringify(
          { ...transcript, captionWarnings, alignment, reused: captionReused },
          null,
          2,
        ),
      );
    }
    const captionRepair = await repairCaptionLayout(captionCues(words), words);
    const cues = captionRepair.cues;
    if (captionRepair.changed)
      repairs.push({
        kind: "captions",
        message:
          "Reflowed captions once inside their original speech spans; retained all words.",
      });
    await writeFile(
      path.join(dir, "captions.vtt"),
      "WEBVTT\n\n" + cues.join("\n\n") + "\n",
    );
    const visualRepair = repairVisualFallbacks(
      story,
      planShots(story, scenes, actual),
    );
    const shots = visualRepair.shots;
    if (visualRepair.replaced.length)
      repairs.push({
        kind: "visuals",
        message: `Replaced ${visualRepair.replaced.join(", ")} text fallback(s) once with existing exact-clause evidence graphics.`,
      });
    const plan = planEvidenceVisuals(story);
    const planIssues = visualPlanIssues(story, shots);
    if (planIssues.length) throw new Error(planIssues[0]);
    const coverage = visualCoverage(shots, actual);
    for (const shot of shots) {
      const asset = story.assets.find((a) => a.id === shot.assetId);
      if (asset) await checkAsset(asset);
    }
    const production = productionRecord(
      story,
      actual,
      shots.at(-1)!.end,
      shots,
    );
    if (
      !options.privatePreview &&
      shots.some((shot) => {
        const asset = story.assets.find((a) => a.id === shot.assetId);
        return (
          (asset?.sourceMedia && !asset.sourceMedia.reviewed) ||
          (asset?.discovery && !asset.discovery.reviewed)
        );
      })
    )
      throw new Error(
        "Review the identity, context and reuse permission of all timeline visuals before final production.",
      );
    for (const [i, shot] of shots.entries()) {
      await progress(
        `Visual ${i + 1}/${shots.length}: ${visualLabel(shot.kind)}`,
      );
      const asset = story.assets.find((a) => a.id === shot.assetId),
        overlayBytes = Buffer.from(
          shotOverlay(story, shot, options.privatePreview),
        ),
        headlineBytes =
          i === 0 ? Buffer.from(openingHeadline(story)) : undefined;
      const materialBytes = await shotMaterial(story, shot);
      const source =
        asset?.mediaType === "video" && shot.kind === "media"
          ? await safeFile(asset.file)
          : undefined;
      const content = materialBytes || (await readFile(source!));
      const key = digest(
        JSON.stringify({
          style: EDITORIAL_STYLE,
          renderer,
          commit: rendererVersion,
          material: digest(content),
          overlay: digest(overlayBytes),
          headline: headlineBytes ? digest(headlineBytes) : null,
          duration: shot.end - shot.start,
          videoStart: shot.videoStart,
          framing: shot.framing,
        }),
      );
      const output = path.join(dir, `${shot.id}.mp4`),
        poster = path.join(dir, `${shot.id}.jpg`);
      const cached = await cachedBytes("shots", key, "mp4");
      if (cached) await writeFile(output, cached);
      else {
        const material = source || path.join(dir, `${shot.id}-material.png`),
          overlay = path.join(dir, `${shot.id}-overlay.png`),
          headline =
            i === 0 ? path.join(dir, "opening-headline.png") : undefined;
        if (materialBytes) await writeFile(material, materialBytes);
        await sharp(overlayBytes).png().toFile(overlay);
        if (headline) await sharp(headlineBytes!).png().toFile(headline);
        const shotInput = {
          mode: "shot",
          kind: source ? "video" : "image",
          motion: shot.kind === "media" && !asset?.graphic,
          material,
          overlay,
          headline,
          duration: shot.end - shot.start,
          videoStart: shot.videoStart || 0,
          output,
        };
        if (renderer === "classic")
          await renderNativeShot({ ...shotInput, video: !!source });
        else await bridge(path.join(dir, `${shot.id}.json`), shotInput);
        await cacheBytes("shots", key, "mp4", await readFile(output));
      }
      const duration = await probe(output);
      if (Math.abs(duration - (shot.end - shot.start)) > 0.065)
        throw new Error("A rendered shot differs from its timed visual plan.");
      const savedPoster = await cachedBytes("posters", key, "jpg");
      if (savedPoster) await writeFile(poster, savedPoster);
      else {
        await exec(
          "ffmpeg",
          [
            "-y",
            "-ss",
            "0.5",
            "-i",
            output,
            "-frames:v",
            "1",
            "-vf",
            "scale=216:384",
            poster,
          ],
          { timeout: 30000 },
        );
        await cacheBytes("posters", key, "jpg", await readFile(poster));
      }
      shot.poster = `${relative}/${shot.id}.jpg`;
      shot.reused = !!cached;
    }
    await progress("Assembling continuous narration and visual timeline");
    const closingFiles = await renderSourceCards(
      story,
      production,
      dir,
      options.privatePreview,
      false,
    );
    await writeFile(
      path.join(dir, "concat.txt"),
      [...shots.map((s) => `${s.id}.mp4`), ...closingFiles]
        .map((f) => `file '${f}'`)
        .join("\n"),
    );
    const silent = path.join(dir, "visuals.mp4"),
      video = path.join(dir, "video.mp4");
    await exec(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        path.join(dir, "concat.txt"),
        "-c",
        "copy",
        silent,
      ],
      { timeout: 60000 },
    );
    await exec(
      "ffmpeg",
      [
        "-y",
        "-i",
        silent,
        "-i",
        masteredAudio,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-af",
        "apad",
        "-t",
        String(production.sourceCards.at(-1)!.end),
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "1",
        "-b:a",
        `${QUALITY_STANDARD.audioBitrateKbps}k`,
        "-movflags",
        "+faststart",
        video,
      ],
      { timeout: 60000 },
    );
    await progress("Rendering speech-aligned captions and final video");
    await finishNativeVideo(dir, cues);
    const duration = await probe(video);
    const timingIssues = productionIssues(story, {
      duration,
      shots,
      production,
    });
    if (timingIssues.length) throw new Error(timingIssues[0]);
    const voice =
      options.provider === "gemini"
        ? `Gemini · ${process.env.GEMINI_VOICE || "Kore"} · synthetic voice`
        : voiceLabel(options.provider);
    const productionProfile: ProductionProfile = {
      standard: VISUAL_STANDARD,
      renderer,
      rendererVersion,
      narrationProvider: options.provider,
      voice,
      captionProvider: options.captions,
      audioBitrateKbps: QUALITY_STANDARD.audioBitrateKbps,
      captionStyle: CAPTION_STYLE,
    };
    const result: Render = {
      productionProfile,
      renderer,
      rendererVersion,
      visualPlan: plan,
      visualCoverage: coverage,
      version: story.version,
      card: `${relative}/card.png`,
      story: `${relative}/story.png`,
      video: `${relative}/video.mp4`,
      captions: `${relative}/captions.vtt`,
      manifest: `${relative}/manifest.json`,
      duration,
      production,
      createdAt: now(),
      voice,
      privatePreview: options.privatePreview,
      captionTiming,
      captionWarnings,
      shots,
      narrationReused: scenes.filter((s) => s.narrationReused).length,
      shotsReused: shots.filter((s) => s.reused).length,
    };
    await progress(
      "Checking final video, captions, evidence and complete sources",
    );
    result.quality = await checkVideoQuality(story, result, {
      video,
      audio: masteredAudio,
      cues,
      repairs,
    });
    await writeFile(
      path.join(dir, "quality.json"),
      JSON.stringify(result.quality, null, 2),
    );
    const manifest = {
      quality: result.quality,
      mediaContextReference: MEDIA_CONTEXT_REFERENCE,
      productionProfile,
      renderer,
      rendererVersion,
      visualPlan: plan,
      visualCoverage: coverage,
      editorialStyle: EDITORIAL_STYLE,
      storyId: story.id,
      version: story.version,
      title: story.title,
      eventAt: story.eventAt,
      createdAt: now(),
      duration,
      production,
      voice,
      narrationProvider: options.provider,
      geminiVoice:
        options.provider === "gemini"
          ? process.env.GEMINI_VOICE || "Kore"
          : undefined,
      narrationModel: options.provider === "gemini" ? GEMINI_MODEL : undefined,
      narrationStyle:
        options.provider === "gemini" ? GEMINI_NARRATION_STYLE : undefined,
      format: story.format || "explainer",
      privatePreview: options.privatePreview,
      warnings: [
        ...(options.privatePreview ? story.automation?.warnings || [] : []),
        ...coverage.warnings,
      ],
      captionTiming,
      captionWarnings,
      captionReused,
      sourcePage: production.sourcePage,
      visualTreatment:
        "Evidence-linked clause visuals: country locators, exact saved document excerpts and explicit dated context, with relevant source media. Shots normally last 3–6 seconds; document and dated explanations allow up to 10 seconds for reading. Continuous narration, two-line captions, source credits and complete closing references. Source audio muted. Maps locate named countries, never incident sites.",
      shots,
      scenes,
      sources: story.sources.map(({ text, ...s }) => s),
      claims: story.claims,
      assets: story.assets.map((a) => ({
        ...a,
        rights: publicMediaRights(a.rights),
      })),
    };
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    return { ...result, warnings: manifest.warnings };
  } catch (error) {
    for (const event of [voiceEvent, captionEvent])
      if (event?.state === "reserved") {
        event.state = "uncertain";
        event.note =
          "Render stopped. Successful audio remains cached; inspect provider usage before another revision.";
        await store!.finishCost(event);
      }
    throw error;
  }
}
