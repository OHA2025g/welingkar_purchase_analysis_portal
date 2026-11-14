FROM python:3.12-alpine
WORKDIR /app
RUN apk add --no-cache su-exec
COPY public/ ./public/
COPY serve.py intake.py entrypoint.sh ./
RUN chmod 755 entrypoint.sh && mkdir -p /data
ENV DATA_DIR=/data
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
