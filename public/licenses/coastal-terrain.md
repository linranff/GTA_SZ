# Shenzhen Bay distant terrain

The opposite-shore mesh is an adapted Copernicus GLO-30 digital surface model, sampled at 70 game metres and scaled vertically by 0.60. It provides distant landscape context. It is not a survey of individual buildings, present-day vegetation or bridge elevations.

Sources: AWS Copernicus DEM 2021 tiles `Copernicus_DSM_COG_10_N22_00_E113_00_DEM` and `Copernicus_DSM_COG_10_N22_00_E114_00_DEM`. Exact URLs, hashes and byte counts are included in `public/city/coastal/far-shore.json` and the reproducible fetch script `scripts/fetch_coastal_dsm.py`.

[Copernicus DEM product and use conditions](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) · [Data on AWS](https://registry.opendata.aws/copernicus-dem/)

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

Road/water intersections and coast outlines derive from the project's pinned OpenStreetMap snapshot, © OpenStreetMap contributors, ODbL. Bridge elevations, railings, park light locations and seawall details are original game reconstruction, not verified as-built positions. Existing OpenStreetMap attribution remains displayed in the game.

## City and northern mountain relief

`public/city/mountain-relief/` derives from the same two pinned Copernicus DSM tiles. `manifest.json` and `near-manifest.json` record source URLs, hashes, grid spacing and adaptations. The northern backdrop samples at 60 real metres; park relief interpolates at 20 real metres from the native 30-metre DSM. Filtering, city datum removal, reserved motor roads/buildings and soft edge transitions are game adaptations, not surveyed terrain. Original broad lawn undulations are also included. Existing Lianhua detail terrain remains separate and unchanged. Generation: `scripts/prepare_city_mountains.py`.
