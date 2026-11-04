"""World News adapter for the pinned, unmodified MoneyPrinterTurbo renderer.

Receives local render-job files only. No provider, script generation, stock search,
network downloads or publishing is invoked by this adapter.
"""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
from contextlib import ExitStack

ROOT = Path(__file__).resolve().parents[2]
LOCK = json.loads((ROOT / 'scripts/media/moneyprinterturbo.json').read_text())
SOURCE = Path(os.environ.get('WORLDNEWS_MPT_SOURCE', ROOT / '.tools/moneyprinterturbo/source')).resolve()
os.environ.setdefault('MPT_HOME', str(ROOT / '.tools/moneyprinterturbo/runtime'))
os.environ['IMAGEIO_FFMPEG_EXE'] = shutil.which('ffmpeg') or 'ffmpeg'
head = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
if head != LOCK['commit']:
    raise RuntimeError('MoneyPrinterTurbo checkout differs from the pinned commit. Run npm run media:setup.')
sys.path.insert(0, str(SOURCE))
from app.services import video
from app.models.schema import VideoParams, VideoAspect
from moviepy import AudioFileClip, CompositeVideoClip, ImageClip, VideoFileClip, vfx

video.fps = 24

def local_file(value, base):
    candidate = Path(value).resolve(strict=True)
    if not candidate.is_relative_to(base):
        raise ValueError('Render files must stay inside the application data directory')
    return str(candidate)

def scene(data, base):
    duration = float(data['duration'])
    if not math.isfinite(duration) or duration <= 0 or duration > 90:
        raise ValueError('Scene duration must be between zero and 90 seconds')
    # Frame-aligned durations keep concatenated video, narration and cue offsets together.
    duration = math.ceil(duration * 24) / 24
    output = Path(data['output']).resolve()
    if not output.is_relative_to(base):
        raise ValueError('Output is outside the data directory')
    with ExitStack() as stack:
        material = local_file(data['material'], base)
        if data['kind'] == 'image':
            original = stack.enter_context(ImageClip(material))
            shot = original.with_duration(duration).resized(lambda t: 1 + 0.035 * t / duration).with_position('center')
        else:
            original = stack.enter_context(VideoFileClip(material, audio=False))
            if original.duration < duration:
                shot = original.with_effects([vfx.Freeze(t='end', total_duration=duration)])
            else:
                shot = original.subclipped(0, duration)
            shot = video._fit_clip_to_canvas(shot, target_width=1080, target_height=1920, fit_mode='contain')
        overlay = stack.enter_context(ImageClip(local_file(data['overlay'], base)))
        audio = stack.enter_context(AudioFileClip(local_file(data['audio'], base)))
        composition = stack.enter_context(CompositeVideoClip([shot, overlay.with_duration(duration)], size=(1080, 1920)).with_duration(duration).with_audio(audio))
        video._write_videofile_with_codec_fallback(composition, output_file=str(output), codec='libx264', atomic_output=True, audio_codec='aac', audio_fps=48000, audio_bitrate='128k', fps=24, preset='ultrafast', threads=2, logger=None)

def shot(data, base):
    frames = round(float(data['duration']) * 24)
    if frames < 72 or frames > 240:
        raise ValueError('Every editorial shot must last 3–10 seconds including reading time')
    duration = frames / 24
    output = Path(data['output']).resolve()
    if not output.is_relative_to(base):
        raise ValueError('Output is outside the data directory')
    with ExitStack() as stack:
        material = local_file(data['material'], base)
        if data['kind'] == 'video':
            original = stack.enter_context(VideoFileClip(material, audio=False))
            start = float(data.get('videoStart', 0))
            if start < 0 or start + duration > original.duration + .05:
                raise ValueError('The selected excerpt exceeds the source clip')
            picture = original.subclipped(start, min(start + duration, original.duration))
            picture = video._fit_clip_to_canvas(picture, target_width=1008, target_height=1000, fit_mode='contain').with_position((36, 330))
        else:
            original = stack.enter_context(ImageClip(material))
            picture = original.with_duration(duration)
            if data.get('motion'):
                picture = picture.resized(lambda t: 1 + .025 * t / duration).with_position('center')
        overlay = stack.enter_context(ImageClip(local_file(data['overlay'], base)))
        layers = [picture, overlay.with_duration(duration)]
        if data.get('headline'):
            headline = stack.enter_context(ImageClip(local_file(data['headline'], base)))
            layers.append(headline.with_duration(min(3, duration)))
        composition = stack.enter_context(CompositeVideoClip(layers, size=(1080, 1920), bg_color=(14, 32, 28)).with_duration(duration))
        video._write_videofile_with_codec_fallback(composition, output_file=str(output), codec='libx264', atomic_output=True, audio=False, fps=24, preset='ultrafast', threads=2, logger=None)

def captions(data, base):
    source = local_file(data['video'], base)
    output = Path(data['output']).resolve()
    if not output.is_relative_to(base):
        raise ValueError('Output is outside the data directory')
    params = VideoParams(video_subject=data['title'], video_script='', video_source='local', video_aspect=VideoAspect.portrait, font_name=LOCK['font'], font_size=58, stroke_width=2, stroke_color='#101c18', text_fore_color='#ffffff', text_background_color='#10251e', rounded_subtitle_background=True, subtitle_position='custom', custom_position=70, subtitle_animation='none', bgm_type='', bgm_volume=0, n_threads=2)
    video.generate_video(source, source, local_file(data['subtitles'], base), str(output), params, bgm_file_override='')

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
parser.add_argument('--input')
args = parser.parse_args()
if args.check:
    print(json.dumps({'renderer':'moneyprinterturbo', 'commit':head, 'version':__import__('app').__version__}))
else:
    data = json.loads(Path(args.input).read_text())
    base = Path(data['dataDir']).resolve(strict=True)
    if data['mode'] == 'scene':
        scene(data, base)
    elif data['mode'] == 'shot':
        shot(data, base)
    elif data['mode'] == 'captions':
        captions(data, base)
    else:
        raise ValueError('Unknown render operation')
