FROM node:22-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./

RUN --mount=type=cache,target=usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci

COPY --chown=node:node . .

RUN npm run build

FROM nginx:alpine

COPY --from=build /usr/src/app/dist /usr/share/nginx/html

CMD ["nginx", "-g", "daemon off;"]