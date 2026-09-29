/* =========================================================
   PARTITION: UTILS / HELPERS (SHARED)
   ---------------------------------------------------------
   Pure DOM helpers used by SEAT CHOOSING + BOOKING.
   No API calls, no auth.
   ========================================================= */

/* --- SEAT STYLING HELPERS --- */

// Sets a plain background color on an element (used elsewhere, e.g. booked/unavailable seats)
function setBackgroundColorById(id) {
  const el = document.getElementById(id);
  if (el) el.style.backgroundColor = 'green';
}

// Applies the "selected" look to a seat button (lime highlight)
function setSeatSelectedStyle(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
    el.classList.add('bg-lime-500', 'text-white');
  }
}

// Reverts selected seat back to available look (minimal toggle helper)
function setSeatDeselectedStyle(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('bg-lime-500', 'text-white');
    el.classList.add('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
  }
}

/* =========================================================
   TEXT / PRICE HELPERS
   ========================================================= */

// Generic helper: set the text content of any element by id
function setInnerText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerText = value;
  }
}

// Adds `value` on top of whatever number is currently shown in the element at `id`
function totalCost(id, value) {
  const totalPriceElement = document.getElementById(id);
  if (!totalPriceElement) return;

  const currentTotal = parseInt(totalPriceElement.innerText) || 0;
  const newTotal = currentTotal + value;
  setInnerText(id, newTotal);
}

// Mirrors the running total into the "grand total" display
function grandTotalCost() {
  const totalPriceElement = document.getElementById('total-cost');
  if (!totalPriceElement) return;

  const currentTotal = parseInt(totalPriceElement.innerText) || 0;
  setInnerText('grand-total', currentTotal);
}
