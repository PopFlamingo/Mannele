# Mannele

Mannele (Alsacian name for [Stutenkerl](https://en.wikipedia.org/wiki/Stutenkerl)) is a Discord bot for the University of Strasbourg students. It currently displays live transit schedules around our university (and everywhere in the city) but may evolve to provide additional data such as weather and pollution alerts or university related infos.

<img src="screenshots/botresponse.png" alt="A screenshot showing the Bot response to calling the slash command for getting station schedules. The response includes a header with station name with an emoji representing the specific station (for instance the observatory station has a telescope emoji). Then under the header you can find lane stop times. Lanes are grouped by wether they are tramway lanes or bus lanes (once again an emoji is also present with the text to illustrate it). Each lane shows lane arrival times for each direction. Lane arrival times are specified in minutes. When a lane is soon to arrive the text is replaced with 'Now'." width="500"/>

# Mannele via Docker


## Installation
Install Docker.io
```bash
sudo apt install docker.io
```

**macOS:**
You can install Docker desktop [directly from the Docker website](https://www.docker.com/products/docker-desktop) or using `brew cask install docker`
## Usage
Commands to run on Mannele's directory
```bash
docker build . --tag mannele
docker run -d --name mannele mannele
```
Attention: Before launching the run command, be sure to have set up an .env file at the directory root where will be stored your bot's Discord token, CTS Token and Discord's Server Token. Also add the value below; 
```bash
STATS_SLOT_COUNT=1
```

Éventuellement pour voir si ça marche correctement:
```bash
docker logs mannele
```

## Contributing
Don't hesitate to contribute by opening issues and pull requests to help with bugs and enhancements.

## Licence
[MIT](https://choosealicense.com/licenses/mit/)
