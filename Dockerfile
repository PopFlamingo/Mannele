FROM node:16.11.1-bullseye-slim

ENV USER=mannele

RUN npm install -g typescript

RUN groupadd -r ${USER} && \
        useradd --create-home --home /home/mannele -r -g ${USER} ${USER}

USER ${USER}
WORKDIR /home/mannele

COPY --chown=${USER}:${USER} . ./

RUN npm install && \
    tsc && \
    node dist/deploy-commands.js

ENTRYPOINT [ "node", "dist/main.js" ]
