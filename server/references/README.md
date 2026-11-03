# Offline locator reference

`geography.json` is a small derivative of Natural Earth's 1:110m land geometry and country label reference points. The upstream commit, original file paths and SHA-256 hashes are recorded inside it. Coastline coordinates are shifted to a 360×180 SVG plane and rounded to two decimals; label points are rounded to three decimals. A small set of English aliases is added, with ambiguous standalone names excluded. It is a locator reference, not an incident-location database.

Data creator: Natural Earth contributors, including Tom Patterson and Nathaniel Vaughn Kelso. [Terms of use](https://www.naturalearthdata.com/about/terms-of-use/) identify the dataset as public domain. The renderer credits Natural Earth on each locator and in the versioned source record. Political boundary polygons are not retained or drawn.

Reproduce the vendored version with `node scripts/update-geography.mjs`. An explicit full upstream commit SHA updates the reference. Review the geography, source policy and phone-size rendered frames before accepting an update. Rendering makes no network request for geography. See [visual planning](../../docs/VISUAL_PLANNING.md) for inference limits.

`media-places.json` separately retains unambiguous names from the pinned 1:50m populated-places reference for conservative media-context conflict checks. It does not geolocate an image or supply event coordinates. Shared names across countries and selected ambiguous English names are excluded. Reproduce it with `node scripts/update-media-places.mjs`; its original filename, commit and SHA-256 are embedded. The manifest records the reference used by the context filter. Matching/unknown place metadata still requires identity review.
