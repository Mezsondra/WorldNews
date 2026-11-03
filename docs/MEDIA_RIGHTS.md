# Documented media reuse decisions

The media panel now separates identity/context review from release permission. The earlier confirmation action still records context review for compatibility, but it preserves the original license text and cannot supply release clearance. Existing exports remain viewable. A new final render or approval requires a documented decision for every selected or timeline asset.

## Decisions

- **Pending:** documentation is incomplete. A labelled local private preview remains possible; final public video is held.
- **Cleared:** the editor records a basis (ownership, documented permission, license or public domain), rights holder, evidence, intended private/public uses, permitted commercial reuse and adaptations, credit, changes, limits, context review and reviewing editor. Applicable ShareAlike handling is recorded separately.
- **Restricted:** use is limited to the recorded scope; it cannot act as public-video clearance.
- **Blocked:** the asset is excluded from all new rendering. Expired permissions and stale decisions also stop use until reviewed again.

This production profile requires both private editorial inspection and public-video permission, including commercial reuse and adaptations. It conservatively rejects a license-based clearance that conflicts with known NonCommercial/NoDerivatives conditions. ShareAlike licenses require an explicit compliance plan. A separate documented grant is a different basis; the app does not infer exceptions or negotiate permission.

These controls implement a recorded editorial decision, not an automated legal determination. Relevant source guidance: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and [Wikimedia Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia). The reviewer must examine the actual work, license and intended use; a search result, credit line or Commons location alone does not settle those questions.

## Versioning and records

Saving a reuse decision hashes the stored media bytes and binds the record to the asset's identity, source hash, original license, provenance, archive status and context. It creates a new story revision, invalidates approval and retains the old export/history. Changes to the bound media/context invalidate the decision. The renderer checks the stored-byte hash before using a cleared asset. An optional expiry is checked again during production and approval.

The public source page includes the decision status/basis, credit, changes, license and public use limits. Private evidence notes, private proof URLs and reviewer identity are kept out of public source pages and export manifests. They remain available in the authenticated editorial workspace. Editors should use the public-license field only for material intended to be linked publicly.

The decision does not authenticate a photograph or establish event context. The planner separately rejects conflicting place metadata and requires named portrait subjects. Matching or unknown geography does not prove image identity. Context review remains necessary.

## API

`PATCH /api/stories/:id/assets/:assetId/rights` accepts the current `version` and a `decision` object. See `mediaRightsSchema` in `server/media-rights.ts` for bounded fields. The server supplies the review timestamp and asset fingerprint; the client cannot choose those. Stale versions and invalid clearances are rejected. `PATCH .../review` retains its context-only role and never replaces an original license with a generic permission statement.

No paid call, external license acceptance or publishing action is performed by recording a decision. Local tests exercise permission scope, license conflicts, expiry, changed bytes/context, public/private records, HTTP version checks and the saved browser workflow using a locally generated test asset.
