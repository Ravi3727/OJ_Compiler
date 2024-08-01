FROM node:20-alpine

RUN apk update && apk add --no-cache \
    g++ \
    gcc \
    openjdk17-jdk \
    python3 \
    py3-pip \
    bash


WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .


RUN mkdir -p codes inputs outputs

EXPOSE 8000

CMD ["node", "index.js"]