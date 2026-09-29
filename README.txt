UIU Shuttle Booking - XAMPP + PHP backend

1. Copy the api folder into:
   C:\xampp\htdocs\uiu-bus\api\

2. Keep your existing frontend files in:
   C:\xampp\htdocs\uiu-bus\
   - index.html
   - style.css
   - shuttle-booking.js
   - utility.js
   - images/ (your existing image folder)

3. Start Apache and MySQL in XAMPP.

4. Import uiu_shuttle_booking.sql through phpMyAdmin.

5. Open the site through Apache, NOT by double-clicking index.html:
   http://localhost/uiu-bus/index.html

6. PHP endpoints:
   GET  api/get_trip.php?route=Dhanmondi&date=YYYY-MM-DD
   GET  api/get_seats.php?trip_id=1
   POST api/create_booking.php

Important:
- Default XAMPP credentials assumed: root / blank password.
- Keep frontend and PHP under the same localhost origin to avoid CORS problems.
- The current frontend still contains hardcoded route display data and map paths. That is fine for the UI.
  Database connection is needed for trip/seat availability and actual booking creation.


DRIVER LOGIN FIX
-----------------
Demo driver account: driver01 / driver123.
If the database already existed before this version, open database/create_driver.php once through XAMPP, or run the driver INSERT from database/schema.sql.
Driver login now requires a fresh browser GPS fix before the dashboard is opened, and restored driver sessions must pass GPS verification again.
