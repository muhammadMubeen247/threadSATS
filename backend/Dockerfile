FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY --chown=node:node . .

EXPOSE 3000

CMD ["node" ,"server.js"] 

