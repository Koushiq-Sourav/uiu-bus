FROM php:8.2-apache
# UIU-BUS — PHP + Apache runtime (Render / Railway / any Docker host).
# MySQL itself is provided by the host (Render managed DB / ClearDB /
# Railway MySQL) via DB_* env vars read in api/config.php.

RUN docker-php-ext-install pdo pdo_mysql mysqli && a2enmod rewrite

# Serve the project root (index.html + api/ live side by side, like XAMPP).
COPY . /var/www/html/

# Apache needs to write nothing; keep it simple and cache-friendly.
RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
