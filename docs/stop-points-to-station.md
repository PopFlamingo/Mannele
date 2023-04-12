# Stop points to station

The /stoppoints-discovery endpoint returns an array of stop points where each point has a stop code and a logical stop code.
The stop code is a unique ID for an individual stop code, while a logical stop code is, in theory, shared by all stop points of a single station.
The issue is that in some cases, for a single station, the API returned stops with heterogeneous logical stop codes, meaning they couldn't be used for this. That's why the normalized stop name is used instead. This issue may have been fixed in the meantime, but can always come back later.
Note that station names aren't necessarily unique, this requires additional processing to handle.
See [this blog post](https://blog.popflamingo.fr/public-transit-bot) for more details.