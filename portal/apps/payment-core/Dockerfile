FROM ruby:4.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libsqlite3-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/payment-core/Gemfile* apps/payment-core/
ENV BUNDLE_GEMFILE=/app/apps/payment-core/Gemfile
RUN bundle install
COPY apps/payment-core/ apps/payment-core/
RUN useradd --system --uid 10001 axiom && mkdir -p /var/lib/axiom && chown axiom /var/lib/axiom
USER axiom
ENV HOST=127.0.0.1 PORT=3083 DATA_DIR=/var/lib/axiom RACK_ENV=production
EXPOSE 3083
CMD ["ruby", "apps/payment-core/bin/api"]
