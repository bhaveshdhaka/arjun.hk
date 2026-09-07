FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -o /out/api .

FROM alpine:3.20
COPY --from=build /out/api /api
ENV DATA_DIR=/data
EXPOSE 8080
CMD ["/api"]
