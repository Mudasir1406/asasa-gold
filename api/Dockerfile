# Laravel API for Railway. serversideup's image gives us nginx + php-fpm on 8080
# with a non-root user and a sane entrypoint, so there is no webserver config here.
FROM serversideup/php:8.4-fpm-nginx

ENV PHP_OPCACHE_ENABLE=1 \
    SSL_MODE=off \
    AUTORUN_ENABLED=true \
    AUTORUN_LARAVEL_MIGRATION=true \
    # Isolation deliberately OFF: --isolated needs the cache_locks table, which
    # does not exist on a first deploy against an empty database. One replica
    # (see railway.json) means there is nothing to isolate against anyway.
    AUTORUN_LARAVEL_MIGRATION_ISOLATION=false \
    AUTORUN_LARAVEL_CONFIG_CACHE=true \
    AUTORUN_LARAVEL_ROUTE_CACHE=true

USER root
RUN install-php-extensions pdo_pgsql bcmath
# Runs after the image's own migration step, so the schema exists. The seeder is
# idempotent: it only posts the SEED batch when the ledger is empty.
COPY --chmod=755 docker/60-seed.sh /etc/entrypoint.d/60-seed.sh
USER www-data

WORKDIR /var/www/html

# Dependencies first so a code change does not re-resolve composer.
COPY --chown=www-data:www-data composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts

COPY --chown=www-data:www-data . .
RUN composer dump-autoload --optimize --no-dev --no-interaction

EXPOSE 8080
