FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN mount=type=cache,target=usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci

COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]