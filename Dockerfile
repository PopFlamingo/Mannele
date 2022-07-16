FROM node:18

ENV USER=mannele
ARG DEPLOY_COMMANDS=YES

RUN npm install -g typescript

RUN groupadd -r ${USER} && \
    useradd --create-home --home /home/mannele -r -g ${USER} ${USER}

USER ${USER}
WORKDIR /home/mannele

COPY --chown=${USER}:${USER} . ./

RUN npm install
RUN tsc

# By default, we will run the Discord command deploy script, however in some cases
# we may not want to do this as part of a build step (such as when building on fly.io)
# so it can be disabled by setting the DEPLOY_COMMANDS variable to NO.
RUN if [ "${DEPLOY_COMMANDS}" = "YES" ]; then node dist/deploy-commands.js; fi


ENTRYPOINT [ "node" ]

# Not putting the following as an ENTRYPOINT argument because some hosting providers
# use the ENTRYPOINT to do other things, so specifying it as an argument would break them.
CMD [ "dist/main.js" ]
