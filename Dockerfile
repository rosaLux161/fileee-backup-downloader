FROM node:lts-alpine@sha256:3689ad4435a413342ccc352170ad0f77433b41173af7fe4c0076f0c9792642cb as build-container

WORKDIR "/app"

COPY package*.json "/app/"
RUN npm ci

COPY . "/app/"
RUN apk add --no-cache --update chromium && \
    npm run build && \
    rm -rf ./.github ./src ./test


FROM node:lts-alpine@sha256:3689ad4435a413342ccc352170ad0f77433b41173af7fe4c0076f0c9792642cb
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

RUN apk add --no-cache --update dumb-init chromium && \
    ln -s /app/dist/bin/start.js /usr/local/bin/start

COPY --from=build-container "/app" "/app"

WORKDIR "/app"
USER node

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/local/bin/start"]
