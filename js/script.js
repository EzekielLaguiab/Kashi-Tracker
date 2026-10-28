// Data Storage
// FIXED: all localStorage.getItem + JSON.parse wrapped in try/catch
// Corrupt or truncated JSON would previously blank the entire app on load
function _safeLoad(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (e) {
    console.warn(
      '[Kashi Tracker] Corrupt localStorage key "' + key + '", using default.',
      e,
    );
    localStorage.removeItem(key);
    return fallback;
  }
}
let transactions = _safeLoad("transactions", []);
// UPDATED: default account icons — use local PNG filenames
let accounts = _safeLoad("accounts", [
  { id: 1, name: "Card", initialBalance: 0, balance: 0.0, icon: "Debit.png" },
  { id: 2, name: "Cash", initialBalance: 0, balance: 0.0, icon: "Cash.png" },
]);
// UPDATED: fallback — patch any saved account that is missing an icon
accounts = accounts.map((a) => ({ ...a, icon: a.icon || "E-wallet.png" }));
let incomeCategories = _safeLoad("incomeCategories", [
  { id: 1, name: "Salary", icon: "💼" },
  { id: 2, name: "Refunds", icon: "↩️" },
  { id: 3, name: "Grants", icon: "🎁" },
  { id: 4, name: "Freelance", icon: "💻" },
  { id: 5, name: "Business", icon: "🏪" },
  { id: 6, name: "Investment", icon: "📈" },
  { id: 7, name: "Allowance", icon: "👛" },
  { id: 8, name: "Bonus", icon: "🌟" },
  { id: 9, name: "Side Job", icon: "🔧" },
  { id: 10, name: "Rental", icon: "🏠" },
]);
let expenseCategories = _safeLoad("expenseCategories", [
  { id: 1, name: "Food", icon: "🍽️" },
  { id: 2, name: "Transport", icon: "🚗" },
  { id: 3, name: "Entertainment", icon: "🎬" },
  { id: 4, name: "Utilities", icon: "💡" },
  { id: 5, name: "Healthcare", icon: "🏥" },
  { id: 6, name: "Shopping", icon: "🛍️" },
  { id: 7, name: "Rent", icon: "🏠" },
  { id: 8, name: "Beauty", icon: "💄" },
  { id: 9, name: "Groceries", icon: "🛒" },
  { id: 10, name: "Coffee", icon: "☕" },
  { id: 11, name: "Snacks", icon: "🍿" },
  { id: 12, name: "Laundry", icon: "👕" },
  { id: 13, name: "Internet", icon: "📶" },
  { id: 14, name: "Phone Load", icon: "📱" },
  { id: 15, name: "Fare/Commute", icon: "🚌" },
  { id: 16, name: "Education", icon: "📚" },
  { id: 17, name: "Clothing", icon: "👗" },
  { id: 18, name: "Gifts", icon: "🎀" },
  { id: 19, name: "Subscriptions", icon: "📺" },
  { id: 20, name: "Personal Care", icon: "🧴" },
]);
let budgets = _safeLoad("budgets", []);

// ── Device Timezone (auto-detected) ──────────────────────────
// Automatically uses the device's local timezone — works anywhere in the world.
const PH_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Returns today's date as YYYY-MM-DD in the device's local timezone.
 * Use this for <input type="date"> — valueAsDate = new Date() uses UTC
 * internally, which can show the wrong date near midnight.
 */
function todayPHString() {
  return new Date().toLocaleDateString("en-CA", { timeZone: PH_TZ }); // "en-CA" gives YYYY-MM-DD
}
// ─────────────────────────────────────────────────────────────

let currentMonth = new Date();
let currentBudgetMonth = new Date(); // FIX BUG 2: separate from currentMonth so Budget nav doesn't shift Records view
let currentAnalysisMonth = new Date();
let currentTransactionType = "income";
let currentSelectorType = "from";
let calcExpression = "0";
let chartInstance = null;
let editingTransactionId = null;
let editingAccountId = null;
let editingCategoryId = null;
let editingCategoryType = null;
let bulkMode = false;
let selectedTxnIds = new Set();
let editingBudgetId = null;
// Category sheet flow flags — declared here so all functions can access them
let categoryOpenedFromTransaction = false;
let categoryOpenedFromBudgetSheet = false;
let categorySheetType = "expense";
// Track which account/category detail is currently open so we can refresh after edit/delete
let _detailContext = null; // { type: 'account'|'category', accountId, categoryName, categoryIcon }
// UPDATED: active filter state for account/category drill-down
let activeFilter = { type: null, value: null, label: null };

// ── Modal Management ──────────────────────────────────────
// FIXED: prevent body scroll when modal is open
function preventBodyScroll() {
  document.body.style.overflow = "hidden";
}

function allowBodyScroll() {
  document.body.style.overflow = "";
}

// Debounce flags to prevent rapid clicks causing UI freezes
let toggleSidebarDebounce = false;
let openSearchModalDebounce = false;

// Helper to check if any modal is currently open
function isAnyModalOpen() {
  const modals = [
    "inputModal",
    "accountModal",
    "categoryModal",
    "budgetModal",
    "searchModal",
    "deleteConfirmModal",
    "validationModal",
    "resetModal",
    "helpModal",
    "feedbackModal",
    "copyBudgetModal",
    "txnDetailModal",
    "currencyModal",
  ];
  return modals.some((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el.classList && el.classList.contains("active")) return true;
    if (el.style.display === "block") return true;
    return false;
  });
}

// FIXED: Handle back button for mobile to close modals
window.addEventListener("popstate", (event) => {
  if (isAnyModalOpen()) {
    event.preventDefault();
    if (document.getElementById("inputModal")?.classList.contains("active"))
      closeModal();
    else if (
      document.getElementById("accountModal")?.classList.contains("active")
    )
      closeAccountModal();
    else if (
      document.getElementById("categoryModal")?.classList.contains("active")
    )
      closeCategoryModal();
    else if (
      document.getElementById("budgetModal")?.classList.contains("active")
    )
      closeBudgetModal();
    else if (
      document.getElementById("searchModal")?.classList.contains("active")
    )
      closeSearchModal();
    else if (
      document.getElementById("deleteConfirmModal")?.style.display === "block"
    )
      closeDeleteModal();
    else if (
      document.getElementById("validationModal")?.style.display === "block"
    )
      closeValidationModal();
    else if (document.getElementById("resetModal")?.style.display === "block")
      closeResetModal();
    else if (document.getElementById("helpModal")?.style.display === "block")
      closeHelpModal();
    else if (
      document.getElementById("feedbackModal")?.style.display === "block"
    )
      closeFeedbackModal();
    else if (
      document.getElementById("copyBudgetModal")?.style.display === "block"
    )
      closeCopyBudgetModal();
    else if (
      document.getElementById("txnDetailModal")?.style.display === "block"
    )
      closeTxnDetailModal();
    else if (
      document.getElementById("currencyModal")?.style.display === "block"
    )
      closeCurrencyModal();
  }
});

// Initialize
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("txnDate").value = todayPHString();
  const _initNow = new Date();
  document.getElementById("budgetMonth").value =
    _initNow.getFullYear() +
    "-" +
    String(_initNow.getMonth() + 1).padStart(2, "0");
  setCurrentTime();
  // FIX: Do NOT call saveData() on init — it would overwrite existing user data
  updateAccountBalances();
  updateMonthDisplay();
  updateAnalysisMonthDisplay();
  updateBudgetMonthDisplay(); // FIX BUG 2: init budget nav independently
  updateUI();
  renderSidebar();
  renderFilterBanner(); // UPDATED: initialise banner (hidden by default)
  // FIXED: attach Help/Feedback listeners here — DOM is guaranteed ready at this point
  var _helpBtn = document.getElementById("helpBtn");
  var _feedbackBtn = document.getElementById("feedbackBtn");
  if (_helpBtn)
    _helpBtn.addEventListener("click", function () {
      // Clear all sidebar active states — Help/Feedback are not section navigations
      document
        .querySelectorAll(".sidebar-item")
        .forEach((item) => item.classList.remove("active"));
      closeSidebar();
      document.getElementById("helpModal").style.display = "block";
      preventBodyScroll();
    });
  if (_feedbackBtn)
    _feedbackBtn.addEventListener("click", function () {
      // Clear all sidebar active states — Help/Feedback are not section navigations
      document
        .querySelectorAll(".sidebar-item")
        .forEach((item) => item.classList.remove("active"));
      closeSidebar();
      document.getElementById("feedbackModal").style.display = "block";
      preventBodyScroll();
    });
  // Restore dark/light mode preference
  // UPDATED: null (first-time user) now defaults to light mode
  const savedMode = localStorage.getItem("colorMode");
  const isLight = savedMode === "light";
  applyDarkMode(savedMode === null ? false : !isLight);

  // ── Calculator button press-flash fix ──────────────────────
  // Android WebView can leave buttons in a "stuck" highlighted state.
  // Solution: on touchend, force an inline background that matches the
  // resting CSS color, then immediately clear it so CSS re-owns the style.
  // This forces a repaint back to the correct resting color every time.
  var calcGrid = document.querySelector(".calculator-buttons");
  if (calcGrid) {
    calcGrid.addEventListener(
      "touchend",
      function (e) {
        var btn = e.target.closest(".calc-btn");
        if (!btn) return;

        // Determine the correct resting background for this button type
        var isLight = document.body.classList.contains("light-mode");
        var restBg;
        if (btn.classList.contains("equals")) {
          restBg = "var(--gold)";
        } else if (btn.classList.contains("operator")) {
          restBg = "var(--gold-soft)";
        } else if (
          btn.classList.contains("clear") ||
          btn.classList.contains("backspace")
        ) {
          restBg = "var(--expense-glow)";
        } else {
          // number / digit buttons
          restBg = isLight ? "#F0EBE3" : "var(--card-bg)";
        }

        // Force the resting color via inline style to flush the stuck state
        btn.style.background = restBg;
        btn.style.boxShadow = "var(--neu-sm)";
        btn.style.opacity = btn.classList.contains("backspace") ? "0.75" : "";

        // Then immediately hand control back to CSS
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            btn.style.background = "";
            btn.style.boxShadow = "";
            btn.style.opacity = "";
          });
        });
      },
      { passive: true },
    );
  }

  // ── Transaction tab press-flash fix ─────────────────────────
  // Same approach: snap inactive tabs back to their raised neumorphic
  // style immediately after touch, so they never stay "flat/active".
  var txnTabs = document.querySelector(".transaction-tabs");
  if (txnTabs) {
    txnTabs.addEventListener(
      "touchend",
      function (e) {
        var btn = e.target.closest(".tab-btn");
        if (!btn) return;
        // After the click handler runs (which sets .active), repaint all tabs
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            txnTabs.querySelectorAll(".tab-btn").forEach(function (tb) {
              // Clear any inline styles so CSS classes fully own the appearance
              tb.style.background = "";
              tb.style.boxShadow = "";
              tb.style.color = "";
            });
          });
        });
      },
      { passive: true },
    );
  }
});

// ── Dark / Light Mode ─────────────────────────────────────────
function applyDarkMode(isDark) {
  document.body.classList.toggle("light-mode", !isDark);
  const toggle = document.getElementById("darkModeToggle");
  if (toggle) toggle.checked = isDark;
  const icon = document.getElementById("darkModeIcon");
  // CHANGED: FA icons replace emoji for dark/light mode toggle
  if (icon)
    icon.innerHTML = isDark
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
  localStorage.setItem("colorMode", isDark ? "dark" : "light");
  // Re-apply theme so logo gradient updates for light/dark
  const savedTheme = localStorage.getItem("appTheme") || "gold";
  if (typeof applyTheme === "function") applyTheme(savedTheme);
  // Re-render charts so colors update immediately on mode switch
  const analysisSection = document.getElementById("analysis-section");
  if (analysisSection && analysisSection.classList.contains("active")) {
    changeAnalysisView();
  }
}

function setCurrentTime() {
  // Use PH timezone so the clock shows Philippine Time even if device clock differs
  const now = new Date();
  const phTime = now.toLocaleTimeString("en-US", {
    timeZone: PH_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // phTime is "HH:MM" — strip any possible leading space
  document.getElementById("txnTime").value = phTime.trim().padStart(5, "0");
}

// FIXED: switchNav no longer relies on implicit global `event` (breaks in strict mode / some mobile browsers)
// Active state is now set by showSection() via navLabels matching, which already handles this correctly
function switchNav(section) {
  showSection(section);
}

// Switch between Records and Budget sub-panels inside the records page
function switchRecordsTab(tab) {
  var recPanel = document.getElementById("recordsSubPanel");
  var budPanel = document.getElementById("budgetSubPanel");
  var recBtn = document.getElementById("recTabRecords");
  var budBtn = document.getElementById("recTabBudget");
  if (!recPanel || !budPanel) return;
  if (tab === "budget") {
    recPanel.style.display = "none";
    budPanel.style.display = "block";
    if (recBtn) recBtn.classList.remove("active");
    if (budBtn) budBtn.classList.add("active");
    updateBudgetMonthDisplay();
    updateBudgets();
  } else {
    budPanel.style.display = "none";
    recPanel.style.display = "block";
    if (budBtn) budBtn.classList.remove("active");
    if (recBtn) recBtn.classList.add("active");
  }
}

function toggleSidebar() {
  // FIXED: debounce rapid clicks to prevent UI freezes
  if (toggleSidebarDebounce) return;
  toggleSidebarDebounce = true;
  setTimeout(() => {
    toggleSidebarDebounce = false;
  }, 400);

  const sidebar = document.getElementById("sidebar");
  const isOpen = sidebar.classList.toggle("active");
  document.getElementById("overlay").classList.toggle("active");
  document.body.classList.toggle("sidebar-open", isOpen);
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");
  document.body.classList.remove("sidebar-open");
}

// FIXED: closeHelpModal / closeFeedbackModal defined here (called from HTML onclick)
function closeHelpModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("helpModal").style.display = "none";
  allowBodyScroll();
}
function closeFeedbackModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("feedbackModal").style.display = "none";
  allowBodyScroll();
}
function sendFeedbackEmail() {
  var mailto =
    "mailto:zeke.laguiab@gmail.com" +
    "?subject=Kashi%20Tracker%20App%20Feedback" +
    "&body=Hi%2C%20I%20have%20feedback%20about%20Kashi%20Tracker%3A%0A%0A";
  closeFeedbackModal();
  // FIX N7: verify InAppBrowser is available before calling; surface error if all paths fail
  setTimeout(function () {
    var opened = false;
    try {
      window.location.href = mailto;
      opened = true;
    } catch (e) {}
    if (!opened) {
      try {
        window.open(mailto, "_blank");
      } catch (e) {
        showNotification(
          '<i class="fa-solid fa-triangle-exclamation"></i>',
          "Cannot Open Email",
          ["Please email zeke.laguiab@gmail.com manually"],
        );
      }
    }
  }, 250);
}

function showSection(section) {
  // FIX: scroll the main container back to top when switching pages
  const _mc = document.querySelector(".main-container");
  if (_mc) _mc.scrollTop = 0;
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  // If budgets nav called (e.g. sidebar), redirect to records + open budget tab
  if (section === "budgets") {
    document.getElementById("records-section").classList.add("active");
    if (typeof switchRecordsTab === "function") switchRecordsTab("budget");
    const navLabels2 = ["records", "analysis", "accounts", "categories"];
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
      if (item.textContent.includes("Records")) item.classList.add("active");
    });
    document.getElementById("sidebar").classList.remove("active");
    document.getElementById("overlay").classList.remove("active");
    return;
  }
  document.getElementById(section + "-section").classList.add("active");

  if (section === "analysis") {
    setTimeout(() => renderExpenseChart(), 100);
  }

  const navLabels = ["records", "analysis", "accounts", "categories"];
  const navTexts = ["Records", "Analysis", "Accounts", "Categories"];
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
    const idx = navLabels.indexOf(section);
    if (idx >= 0 && item.textContent.includes(navTexts[idx])) {
      item.classList.add("active");
    }
  });

  document.getElementById("sidebar").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");
}

function renderSidebar() {
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.remove("active");
    // UPDATED: trim() exact match to avoid "Import Records" matching "Records"
    if (item.textContent.trim() === "Records") item.classList.add("active");
  });
}

// ── Month Navigation ──────────────────────────────────────────
function previousMonth() {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  updateMonthDisplay();
  updateRecords();
}

function nextMonth() {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  updateMonthDisplay();
  updateRecords();
}

function updateMonthDisplay() {
  const options = { month: "long", year: "numeric", timeZone: PH_TZ };
  document.getElementById("currentMonth").textContent =
    currentMonth.toLocaleDateString("en-US", options);
}

// FIX BUG 2: dedicated display updater for the Budgets nav, uses currentBudgetMonth
function updateBudgetMonthDisplay() {
  const options = { month: "long", year: "numeric", timeZone: PH_TZ };
  const budgetNavEl = document.getElementById("currentBudgetMonthNav");
  if (budgetNavEl)
    budgetNavEl.textContent = currentBudgetMonth.toLocaleDateString(
      "en-US",
      options,
    );
}

function previousBudgetMonth() {
  currentBudgetMonth.setMonth(currentBudgetMonth.getMonth() - 1); // FIX BUG 2: use dedicated currentBudgetMonth
  updateBudgetMonthDisplay();
  updateBudgets();
}

function nextBudgetMonth() {
  currentBudgetMonth.setMonth(currentBudgetMonth.getMonth() + 1); // FIX BUG 2: use dedicated currentBudgetMonth
  updateBudgetMonthDisplay();
  updateBudgets();
}

function previousAnalysisMonth() {
  currentAnalysisMonth.setMonth(currentAnalysisMonth.getMonth() - 1);
  updateAnalysisMonthDisplay();
  updateAnalysis();
}

function nextAnalysisMonth() {
  currentAnalysisMonth.setMonth(currentAnalysisMonth.getMonth() + 1);
  updateAnalysisMonthDisplay();
  updateAnalysis();
}

function updateAnalysisMonthDisplay() {
  const options = { month: "long", year: "numeric", timeZone: PH_TZ };
  document.getElementById("currentAnalysisMonth").textContent =
    currentAnalysisMonth.toLocaleDateString("en-US", options);
}

// ── Notification ──────────────────────────────────────────────
let notificationTimeout = null;

function hideNotification() {
  const toast = document.getElementById("notificationToast");
  toast.classList.remove("show");
  toast.classList.remove("swipe-out-left");
  toast.classList.remove("swipe-out-right");
  toast.classList.remove("swiping");
  toast.style.transform = "";
  toast.style.opacity = "";
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
  }
}

function dismissNotificationTo(direction) {
  const toast = document.getElementById("notificationToast");
  if (!toast.classList.contains("show")) return;
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
  }
  toast.classList.remove("swiping");
  toast.style.transform = "";
  toast.style.opacity = "";
  toast.classList.add(
    direction === "left" ? "swipe-out-left" : "swipe-out-right",
  );
  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.remove("swipe-out-left");
    toast.classList.remove("swipe-out-right");
    toast.style.transform = "";
    toast.style.opacity = "";
  }, 300);
}

function showNotification(icon, title, details) {
  const toast = document.getElementById("notificationToast");
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
  }
  // Reset all swipe state before showing
  toast.classList.remove(
    "show",
    "swiping",
    "swipe-out-left",
    "swipe-out-right",
  );
  toast.style.transform = "";
  toast.style.opacity = "";
  setTimeout(() => {
    document.getElementById("notifIcon").innerHTML = icon;
    document.getElementById("notifTitle").textContent = title;
    let bodyHTML = "";
    if (Array.isArray(details)) {
      details.forEach((d) => {
        bodyHTML += `<div class="notification-detail">${d}</div>`;
      });
    } else {
      bodyHTML = `<div>${details}</div>`;
    }
    document.getElementById("notifBody").innerHTML = bodyHTML;
    toast.classList.add("show");
    notificationTimeout = setTimeout(hideNotification, 3500);
  }, 50);
}

document.addEventListener("DOMContentLoaded", function () {
  const toast = document.getElementById("notificationToast");

  // FIXED: declare swipe-state vars BEFORE the click listener so _notifSwipeDidMove is in scope
  let _notifStartX = 0;
  let _notifStartY = 0;
  let _notifSwipeActive = false;
  let _notifSwipeDidMove = false;

  // ── Tap to dismiss (original functionality preserved) ──
  toast.addEventListener("click", function (e) {
    // Only dismiss on tap — not at end of a swipe gesture
    if (_notifSwipeDidMove) return;
    hideNotification();
  });

  // ── Swipe to dismiss ──
  let _notifBaseX = 0; // the translateX offset when shown (i.e. -50%)

  function _notifGetCurrentX() {
    // Current X offset relative to center (-50vw ~ 0)
    return _notifBaseX;
  }

  function onNotifTouchStart(e) {
    if (!toast.classList.contains("show")) return;
    _notifStartX = e.touches[0].clientX;
    _notifStartY = e.touches[0].clientY;
    _notifSwipeActive = true;
    _notifSwipeDidMove = false;
    _notifBaseX = 0;
    toast.classList.add("swiping");
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
  }

  function onNotifTouchMove(e) {
    if (!_notifSwipeActive) return;
    const dx = e.touches[0].clientX - _notifStartX;
    const dy = e.touches[0].clientY - _notifStartY;
    // Only track horizontal swipes
    if (!_notifSwipeDidMove && Math.abs(dy) > Math.abs(dx)) {
      _notifSwipeActive = false;
      toast.classList.remove("swiping");
      return;
    }
    if (Math.abs(dx) > 5) {
      _notifSwipeDidMove = true;
      e.preventDefault();
    }
    _notifBaseX = dx;
    const opacity = Math.max(0, 1 - Math.abs(dx) / 160);
    toast.style.transform = `translateX(calc(-50% + ${dx}px)) translateY(0)`;
    toast.style.opacity = opacity;
  }

  function onNotifTouchEnd(e) {
    if (!_notifSwipeActive) return;
    _notifSwipeActive = false;
    toast.classList.remove("swiping");
    const dx = e.changedTouches[0].clientX - _notifStartX;
    if (Math.abs(dx) > 80) {
      dismissNotificationTo(dx < 0 ? "left" : "right");
    } else {
      // Snap back
      toast.style.transform = "";
      toast.style.opacity = "";
      notificationTimeout = setTimeout(hideNotification, 2500);
    }
    setTimeout(() => {
      _notifSwipeDidMove = false;
    }, 50);
  }

  // ── Mouse drag (desktop) ──
  let _notifMouseDown = false;
  let _notifMouseStartX = 0;
  let _notifMouseMoved = false;

  function onNotifMouseDown(e) {
    if (!toast.classList.contains("show")) return;
    _notifMouseDown = true;
    _notifMouseStartX = e.clientX;
    _notifMouseMoved = false;
    toast.classList.add("swiping");
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
    e.preventDefault();
  }

  function onNotifMouseMove(e) {
    if (!_notifMouseDown) return;
    const dx = e.clientX - _notifMouseStartX;
    if (Math.abs(dx) > 5) _notifMouseMoved = true;
    const opacity = Math.max(0, 1 - Math.abs(dx) / 160);
    toast.style.transform = `translateX(calc(-50% + ${dx}px)) translateY(0)`;
    toast.style.opacity = opacity;
  }

  function onNotifMouseUp(e) {
    if (!_notifMouseDown) return;
    _notifMouseDown = false;
    toast.classList.remove("swiping");
    const dx = e.clientX - _notifMouseStartX;
    if (Math.abs(dx) > 80) {
      dismissNotificationTo(dx < 0 ? "left" : "right");
    } else {
      toast.style.transform = "";
      toast.style.opacity = "";
      notificationTimeout = setTimeout(hideNotification, 2500);
    }
    setTimeout(() => {
      _notifSwipeDidMove = _notifMouseMoved && Math.abs(dx) > 5;
      _notifMouseMoved = false;
    }, 50);
  }

  toast.addEventListener("touchstart", onNotifTouchStart, { passive: true });
  toast.addEventListener("touchmove", onNotifTouchMove, { passive: false });
  toast.addEventListener("touchend", onNotifTouchEnd);
  toast.addEventListener("mousedown", onNotifMouseDown);
  document.addEventListener("mousemove", onNotifMouseMove);
  document.addEventListener("mouseup", onNotifMouseUp);
});

// ── Modal Functions ───────────────────────────────────────────
function openModal() {
  editingTransactionId = null;
  // FIX: Always restore pointer-events — if account/category selector was
  // closed abnormally (tap outside without ✕), inputModal stays non-interactive
  const inputModal = document.getElementById("inputModal");
  inputModal.style.opacity = "1";
  inputModal.style.pointerEvents = "auto";
  inputModal.classList.add("active");
  document.getElementById("modalTitle").textContent = "Add Transaction";
  // FIX: resetForm first, THEN setTransactionTypeDirect so tab active state
  // is applied after the reset (not overwritten by it)
  resetForm();
  setTransactionTypeDirect("expense"); // UPDATED: default expense
  // FIXED: prevent body scroll
  preventBodyScroll();
}

function closeModal() {
  // Restore pointer-events before hiding, in case selector left it disabled
  const inputModal = document.getElementById("inputModal");
  inputModal.style.opacity = "1";
  inputModal.style.pointerEvents = "auto";
  inputModal.classList.remove("active");
  // Close any open sub-sheets
  document.getElementById("accountSelectorModal").classList.remove("active");
  document.getElementById("categoryModal").classList.remove("active");
  document.getElementById("categoryModal").classList.remove("above-sheet");
  // Reset sheet flags
  categoryOpenedFromTransaction = false;
  categoryOpenedFromBudgetSheet = false;
  resetForm();
  editingTransactionId = null;
  // FIXED: restore body scroll
  allowBodyScroll();
}

// UPDATED: PNG account icons — filenames stored, displayed as <img>
const ACCOUNT_ICONS = [
  { file: "Cash.png", label: "Cash" },
  { file: "Credit.png", label: "Credit" },
  { file: "Debit.png", label: "Debit" },
  { file: "Debt.png", label: "Debt" },
  { file: "Savings.png", label: "Savings" },
  { file: "E-wallet.png", label: "E-Wallet" },
  { file: "Digital Bank.png", label: "Digital Bank" },
  { file: "Investments.png", label: "Investments" },
];

// UPDATED: helper — returns <img> tag for a PNG icon filename, or emoji fallback
function renderAccountIconImg(iconValue, cssClass) {
  if (!iconValue) return "🏦";
  if (iconValue.toLowerCase().endsWith(".png")) {
    return `<img src="images/${iconValue}" class="${cssClass || "acct-png-icon"}" alt="${iconValue}" onerror="this.style.display='none'">`;
  }
  return iconValue;
}

// UPDATED: render PNG icon selection grid
function renderAccountEmojiPicker(selectedIcon) {
  const container = document.getElementById("accountIconGrid");
  if (!container) return;
  container.innerHTML = ACCOUNT_ICONS.map(
    (ic) =>
      `<div class="acct-icon-item${ic.file === selectedIcon ? " selected" : ""}"
                    onclick="selectAccountIcon('${ic.file}')" title="${ic.label}">
                    <img src="images/${ic.file}" alt="${ic.label}" onerror="this.style.display='none'">
                    <span>${ic.label}</span>
                </div>`,
  ).join("");
}

// UPDATED: select a PNG icon
function selectAccountIcon(filename) {
  document.getElementById("accountIcon").value = filename;
  document.querySelectorAll(".acct-icon-item").forEach((el) => {
    el.classList.toggle(
      "selected",
      el.getAttribute("onclick") === `selectAccountIcon('${filename}')`,
    );
  });
}

// UPDATED: kept for compatibility — no-op since icon is set via grid click
function onAccountIconInput() {}

function openAccountModal(accountId = null) {
  editingAccountId = accountId;
  document.getElementById("accountModal").classList.add("active");
  preventBodyScroll();
  if (accountId) {
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      document.getElementById("accountModalTitle").textContent = "Edit Account";
      document.getElementById("accountName").value = account.name;
      document.getElementById("accountBalance").value =
        typeof account.initialBalance === "number"
          ? account.initialBalance
          : account.balance;
      document.getElementById("accountIcon").value = account.icon;

      renderAccountEmojiPicker(account.icon);
    }
  } else {
    document.getElementById("accountModalTitle").textContent =
      "Add New Account";
    document.getElementById("accountName").value = "";
    document.getElementById("accountBalance").value = "";
    document.getElementById("accountIcon").value = "";

    renderAccountEmojiPicker("");
  }
}

function closeAccountModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("accountModal").classList.remove("active");
  editingAccountId = null;
  allowBodyScroll();
}

function openCategoryModal(type, categoryId = null) {
  editingCategoryId = categoryId;
  editingCategoryType = type;
  document.getElementById("categoryModal").classList.add("active");
  preventBodyScroll();
  document.getElementById("categoryType").value = type;
  renderEmojiPicker(type);
  if (categoryId) {
    const cats = type === "income" ? incomeCategories : expenseCategories;
    const cat = cats.find((c) => c.id === categoryId);
    if (cat) {
      document.getElementById("categoryModalTitle").textContent =
        `Edit ${type === "income" ? "Income" : "Expense"} Category`;
      document.getElementById("categoryName").value = cat.name;
      document.getElementById("categoryIcon").value = cat.icon;
      // Highlight the currently selected emoji
      document.querySelectorAll(".emoji-btn").forEach((btn) => {
        btn.classList.toggle("emoji-selected", btn.textContent === cat.icon);
      });
    }
  } else {
    document.getElementById("categoryModalTitle").textContent =
      `Add ${type === "income" ? "Income" : "Expense"} Category`;
    document.getElementById("categoryName").value = "";
    document.getElementById("categoryIcon").value = "";
  }
}

function renderEmojiPicker(type) {
  const incomeEmojis = [
    // Salary & Employment
    "💼",
    "👔",
    "🏢",
    "🖥️",
    "⏰",
    "📋",
    "🤝",
    "🪪",
    // Business & Freelance
    "🏪",
    "🧑‍💻",
    "📐",
    "🔨",
    "🎨",
    "✏️",
    "📸",
    "🎤",
    // Investments & Finance
    "📈",
    "💹",
    "🏦",
    "🪙",
    "💵",
    "💰",
    "📊",
    "💳",
    // Side Hustle & Sales
    "🛒",
    "📦",
    "🚚",
    "🤳",
    "🎯",
    "🏷️",
    "🧧",
    "🎁",
    // Passive & Other Income
    "🏠",
    "🏘️",
    "📡",
    "🎓",
    "✈️",
    "🌐",
    "🔑",
    "⭐",
    // Bonuses & Misc
    "🏆",
    "🎉",
    "🎊",
    "💎",
    "🌟",
    "❤️",
    "🔥",
    "📊",
  ];

  const expenseEmojis = [
    // Food & Drink
    "🍽️",
    "☕",
    "🍕",
    "🍜",
    "🥤",
    "🍿",
    "🍱",
    "🥗",
    // Transport
    "🚗",
    "🚌",
    "✈️",
    "🚲",
    "⛽",
    "🛵",
    "🚕",
    "🚢",
    // Shopping & Home
    "🛒",
    "🏠",
    "🛍️",
    "🪴",
    "🧹",
    "💡",
    "🛋️",
    "🔧",
    // Health & Body
    "💊",
    "🏥",
    "🏋️",
    "💆",
    "🧴",
    "🧼",
    "🩺",
    "🦷",
    // Work & Finance
    "💼",
    "💻",
    "📱",
    "📈",
    "💵",
    "💳",
    "🏦",
    "🧾",
    // Entertainment & Leisure
    "🎬",
    "🎮",
    "🎵",
    "📚",
    "⚽",
    "🎓",
    "🎯",
    "🎨",
    // Fashion & Personal
    "👕",
    "👗",
    "💄",
    "👟",
    "👛",
    "🎀",
    "⌚",
    "💍",
    // Misc & Utility
    "🐾",
    "🎁",
    "❤️",
    "🔥",
    "⭐",
    "💰",
    "🪙",
    "📊",
  ];

  const emojis = type === "income" ? incomeEmojis : expenseEmojis;
  const picker = document.getElementById("emojiPicker");
  if (!picker) return;

  const rows = [[], [], [], []];
  emojis.forEach((e, i) => rows[i % 4].push(e));

  picker.innerHTML = `<div class="emoji-grid-inner">${rows
    .map(
      (row) =>
        `<div class="emoji-row">${row
          .map(
            (e) =>
              `<span class="emoji-btn" onclick="selectEmoji('${e}')">${e}</span>`,
          )
          .join("")}</div>`,
    )
    .join("")}</div>`;
}

function selectEmoji(e) {
  document.getElementById("categoryIcon").value = e;
  document.querySelectorAll(".emoji-btn").forEach((btn) => {
    btn.classList.toggle("emoji-selected", btn.textContent === e);
  });
}

function closeCategoryModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  const catModal = document.getElementById("categoryModal");
  catModal.classList.remove("active");
  catModal.classList.remove("above-sheet");
  // FIXED: type field is now hidden input, no disabled state to reset
  editingCategoryId = null;
  editingCategoryType = null;
  // Always restore inputModal interactivity (may have been dimmed by from-sheet flow)
  const im = document.getElementById("inputModal");
  if (im && !categoryOpenedFromBudgetSheet && !categoryOpenedFromTransaction) {
    im.style.opacity = "1";
    im.style.pointerEvents = "auto";
  }
  if (categoryOpenedFromBudgetSheet) {
    categoryOpenedFromBudgetSheet = false;
    // Re-render with updated categories, reopen sheet, restore budget modal dim
    renderBudgetCategoryGrid();
    document.getElementById("budgetCategorySheet").classList.add("active");
    const bm = document.getElementById("budgetModal");
    if (bm) {
      bm.style.opacity = "0.45";
      bm.style.pointerEvents = "none";
    }
  } else if (categoryOpenedFromTransaction) {
    categoryOpenedFromTransaction = false;
    // Re-render sheet with updated categories and reopen
    renderTransactionCategorySheet(categorySheetType);
    document.getElementById("accountSelectorModal").classList.add("active");
    // inputModal stays visible but dimmed behind sheet
    const im = document.getElementById("inputModal");
    if (im) {
      im.style.opacity = "0.5";
      im.style.pointerEvents = "none";
    }
  }
  // FIXED: restore body scroll only if no other modals are open
  if (!isAnyModalOpen()) allowBodyScroll();
}

function openBudgetModal(budgetId = null) {
  editingBudgetId = budgetId;
  document.getElementById("budgetModal").classList.add("active");
  preventBodyScroll();
  if (budgetId) {
    const budget = budgets.find((b) => b.id === budgetId);
    if (budget) {
      document.getElementById("budgetModalTitle").textContent = "Edit Budget";
      document.getElementById("budgetCategory").value = budget.category;
      document.getElementById("budgetLimit").value = budget.limit;
      document.getElementById("budgetMonth").value = budget.month;
      // FIX M8: lock month when editing — changing it silently re-attributes historical data
      document.getElementById("budgetMonth").disabled = true;
      document.getElementById("budgetMonth").title =
        "Month cannot be changed when editing a budget";
      updateBudgetCategoryOptions(budget.category);
    }
  } else {
    document.getElementById("budgetModalTitle").textContent = "Add Budget";
    document.getElementById("budgetCategory").value = "";
    document.getElementById("budgetLimit").value = "";
    document.getElementById("budgetMonth").disabled = false;
    document.getElementById("budgetMonth").title = "";
    const _now = new Date();
    document.getElementById("budgetMonth").value =
      _now.getFullYear() + "-" + String(_now.getMonth() + 1).padStart(2, "0");
    updateBudgetCategoryOptions("");
  }
}

function closeBudgetModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("budgetModal").classList.remove("active");
  document.getElementById("budgetModal").style.opacity = "1";
  document.getElementById("budgetModal").style.pointerEvents = "auto";
  // Close category sheet if open
  document.getElementById("budgetCategorySheet").classList.remove("active");
  document.getElementById("categoryModal").classList.remove("active");
  document.getElementById("categoryModal").classList.remove("above-sheet");
  categoryOpenedFromBudgetSheet = false;
  editingBudgetId = null;
  allowBodyScroll();
}

// ── Account / Category Selector ───────────────────────────────
function showAccountSelectorMobile(type) {
  currentSelectorType = type;
  document.getElementById("selectorTitle").textContent = "Select Account";
  let html = "";
  /* UPDATED: account display in modal — icon + name + balance layout */
  accounts.forEach((account) => {
    html += `
                    <div class="account-item" onclick="selectAccountMobile('${account.name}', ${account.id}, '${type}')">
                        <div class="account-option-icon">${renderAccountIconImg(account.icon, "acct-png-icon-lg")}</div>
                        <div class="account-item-info">
                            <div class="account-item-name">${account.name}</div>
                            <div class="account-item-balance">${getCurrencySymbol()}${fmtNum(account.balance)}</div>
                        </div>
                    </div>`;
  });
  document.getElementById("accountListContainer").innerHTML = html;
  document.getElementById("accountSelectorModal").classList.add("active");
  document.getElementById("inputModal").style.opacity = "0.5";
  document.getElementById("inputModal").style.pointerEvents = "none";
}

function selectAccountMobile(accountName, accountId, type) {
  const acc = accounts.find((a) => a.id === accountId);
  // UPDATED: use shared helper — injects icon+name into selected-item-left div
  if (
    currentTransactionType === "income" ||
    currentTransactionType === "expense"
  ) {
    _setSelectedAccount("txnAccountText", acc);
    document.getElementById("txnAccountDisplay").dataset.accountId = accountId;
  } else if (currentTransactionType === "transfer") {
    if (type === "transfer-from") {
      _setSelectedAccount("transferFromText", acc);
      document.getElementById("transferFromDisplay").dataset.accountId =
        accountId;
    } else if (type === "transfer-to") {
      _setSelectedAccount("transferToText", acc);
      document.getElementById("transferToDisplay").dataset.accountId =
        accountId;
    }
  }
  closeAccountSelector();
}

function closeAccountSelector() {
  document.getElementById("accountSelectorModal").classList.remove("active");
  document.getElementById("inputModal").style.opacity = "1";
  document.getElementById("inputModal").style.pointerEvents = "auto";
}

// categoryOpenedFromTransaction and categorySheetType declared at top-level below

function showCategorySelectorMobile(type) {
  categorySheetType = type;
  document.getElementById("selectorTitle").textContent = "Select Category";
  renderTransactionCategorySheet(type);
  document.getElementById("accountSelectorModal").classList.add("active");
  document.getElementById("inputModal").style.opacity = "0.5";
  document.getElementById("inputModal").style.pointerEvents = "none";
}

function renderTransactionCategorySheet(type) {
  const categories = type === "income" ? incomeCategories : expenseCategories;
  const typeLabel = type === "income" ? "Income" : "Expense";
  let html = '<div class="category-grid-3col">';
  categories.forEach((category) => {
    html += `
                    <div class="category-item" onclick="selectCategoryMobile('${category.name.replace(/'/g, "\\'")}', ${category.id}, '${type}')">
                        <div class="category-item-icon">${category.icon}</div>
                        <div class="category-item-name">${category.name}</div>
                    </div>`;
  });
  html += "</div>";
  // Add "+" button at the bottom
  html += `<button class="sheet-add-cat-btn" onclick="openCategoryFromTransactionSheet('${type}')">+ Add ${typeLabel} Category</button>`;
  document.getElementById("accountListContainer").innerHTML = html;
}

function openCategoryFromTransactionSheet(type) {
  categoryOpenedFromTransaction = true;
  // Raise category modal above sheet; both sheet and inputModal stay behind
  document.getElementById("categoryModal").classList.add("above-sheet");
  const im = document.getElementById("inputModal");
  if (im) {
    im.style.opacity = "0.3";
    im.style.pointerEvents = "none";
  }
  openCategoryModal(type);
}
function selectCategoryMobile(categoryName, categoryId, type) {
  const cats = type === "income" ? incomeCategories : expenseCategories;
  const cat = cats.find((c) => c.id === categoryId || c.name === categoryName);
  // UPDATED: use shared helper — injects icon+name into selected-item-left div
  _setSelectedCategory("txnCategoryText", cat, categoryName);
  document.getElementById("txnCategoryDisplay").dataset.categoryId = categoryId;
  closeAccountSelector();
}

// FIX BUG 4: HTML tab buttons now call setTransactionTypeDirect() directly.
// This function is kept only for backward compatibility but is no longer called from HTML.
// It relied on the implicit global `event` object, which is unreliable in strict mode.
function setTransactionType(type) {
  setTransactionTypeDirect(type);
}

// Safe programmatic version — no event dependency
function setTransactionTypeDirect(type) {
  currentTransactionType = type;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (
      (type === "income" && btn.textContent.includes("INCOME")) ||
      (type === "expense" && btn.textContent.includes("EXPENSE")) ||
      (type === "transfer" && btn.textContent.includes("TRANSFER"))
    ) {
      btn.classList.add("active");
    }
  });
  _applyTransactionTypeUI(type);
}

// UPDATED: helper to reset a selected-item-left div back to placeholder state
function _resetSelectedItem(divId, placeholder) {
  const el = document.getElementById(divId);
  if (!el) return;
  el.innerHTML = `<span class="selected-item-placeholder">${placeholder}</span>`;
}
// UPDATED: helper to set a selected-item-left div with account icon+name
function _setSelectedAccount(divId, acc) {
  const el = document.getElementById(divId);
  if (!el) return;
  const iconHTML = acc?.icon?.toLowerCase().endsWith(".png")
    ? `<img src="images/${acc.icon}" onerror="this.style.display='none'">`
    : `<span class="selected-item-emoji">${acc?.icon || "🏦"}</span>`;
  el.innerHTML =
    iconHTML + `<span class="selected-item-name">${acc.name}</span>`;
}
// UPDATED: helper to set a selected-item-left div with category icon+name
function _setSelectedCategory(divId, cat, fallbackText) {
  const el = document.getElementById(divId);
  if (!el) return;
  if (cat) {
    el.innerHTML = `<span class="selected-item-emoji">${cat.icon}</span><span class="selected-item-name">${cat.name}</span>`;
  } else {
    el.innerHTML = `<span class="selected-item-name">${fallbackText || ""}</span>`;
  }
}

function _applyTransactionTypeUI(type) {
  // UPDATED: restore placeholder appearance on tab switch
  _resetSelectedItem("txnAccountText", "Select Account");
  _resetSelectedItem("txnCategoryText", "Select Category");
  _resetSelectedItem("transferFromText", "Select Account");
  _resetSelectedItem("transferToText", "Select Account");
  if (type === "transfer") {
    document.getElementById("incomeExpenseForm").style.display = "none";
    document.getElementById("transferForm").style.display = "block";
  } else {
    document.getElementById("incomeExpenseForm").style.display = "block";
    document.getElementById("transferForm").style.display = "none";
  }
}

function updateAccountSelects(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = "<option>Select Account</option>";
  accounts.forEach((acc) => {
    const option = document.createElement("option");
    option.value = acc.id;
    // UPDATED: option text — strip .png for clean label in <select>
    const iconLabel =
      acc.icon && acc.icon.toLowerCase().endsWith(".png")
        ? acc.icon.replace(/\.png$/i, "")
        : acc.icon || "";
    option.textContent = `${iconLabel} ${acc.name}`;
    select.appendChild(option);
  });
}

function showAccountBalance() {
  /* balance shown inline in selector list */
}

// tracks which tab is active in the budget category sheet
function updateBudgetCategoryOptions(selectedValue) {
  const text = document.getElementById("budgetCategoryText");
  if (text) {
    if (selectedValue) {
      const cat = expenseCategories.find((c) => c.name === selectedValue);
      text.textContent = cat ? cat.icon + " " + cat.name : selectedValue;
    } else {
      text.textContent = "Select Category";
    }
  }
  document.getElementById("budgetCategory").value = selectedValue || "";
}

function openBudgetCategorySheet() {
  renderBudgetCategoryGrid();
  document.getElementById("budgetCategorySheet").classList.add("active");
  const bm = document.getElementById("budgetModal");
  if (bm) {
    bm.style.opacity = "0.45";
    bm.style.pointerEvents = "none";
  }
}

function closeBudgetCategorySheet() {
  document.getElementById("budgetCategorySheet").classList.remove("active");
  const bm = document.getElementById("budgetModal");
  if (bm) {
    bm.style.opacity = "1";
    bm.style.pointerEvents = "auto";
  }
}

function renderBudgetCategoryGrid() {
  const grid = document.getElementById("budgetCategoryGrid");
  const none = document.getElementById("budgetCatNone");
  if (!grid) return;
  const currentVal = document.getElementById("budgetCategory").value;
  if (!expenseCategories || expenseCategories.length === 0) {
    grid.innerHTML = "";
    if (none) none.style.display = "block";
    return;
  }
  if (none) none.style.display = "none";
  grid.innerHTML = expenseCategories
    .map((cat) => {
      const sel = currentVal === cat.name ? "selected" : "";
      const safeName = cat.name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      return `<div class="budget-cat-tile ${sel}" data-cat="${cat.name}" onclick="selectBudgetCategory('${safeName}')">
                    <span class="bct-icon">${cat.icon || "💰"}</span>
                    <span class="bct-name">${cat.name}</span>
                </div>`;
    })
    .join("");
}

function selectBudgetCategory(catName) {
  const cat = expenseCategories.find((c) => c.name === catName);
  document.getElementById("budgetCategory").value = catName;
  const text = document.getElementById("budgetCategoryText");
  if (text) text.textContent = cat ? cat.icon + " " + cat.name : catName;
  document
    .querySelectorAll("#budgetCategoryGrid .budget-cat-tile")
    .forEach((t) => {
      t.classList.toggle("selected", t.dataset.cat === catName);
    });
  setTimeout(closeBudgetCategorySheet, 180);
}

// categoryOpenedFromBudgetSheet declared at top-level above

function openCategoryFromBudgetSheet() {
  categoryOpenedFromBudgetSheet = true;
  // Keep budget sheet visible, raise category modal above both
  document.getElementById("categoryModal").classList.add("above-sheet");
  const bm = document.getElementById("budgetModal");
  if (bm) {
    bm.style.opacity = "0.3";
    bm.style.pointerEvents = "none";
  }
  openCategoryModal("expense");
}

function populateBudgetCopyOptions() {
  /* replaced by multi-select modal */
}
function copyPreviousBudget() {
  /* replaced by multi-select modal */
}

// ── Copy Budget Multi-Select Modal ────────────────────────────
let copyBudgetSelectedIds = new Set();

function openCopyBudgetModal() {
  const cy = currentBudgetMonth.getFullYear(); // FIX BUG 2
  const cm = String(currentBudgetMonth.getMonth() + 1).padStart(2, "0"); // FIX BUG 2
  const currentMonthStr = `${cy}-${cm}`;
  const availableMonths = [...new Set(budgets.map((b) => b.month))]
    .filter((m) => m !== currentMonthStr)
    .sort()
    .reverse();

  if (availableMonths.length === 0) {
    showValidationModal(["No previous months with budgets found"]);
    return;
  }

  const sourceMonth = availableMonths[0];
  const sourceBudgets = budgets.filter((b) => b.month === sourceMonth);
  copyBudgetSelectedIds = new Set();

  // FIX M3: T12:00:00 (noon local) prevents UTC-midnight timezone shift in month display
  const sourceLabel = new Date(sourceMonth + "T12:00:00").toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: PH_TZ },
  );
  const targetLabel = new Date(
    currentMonthStr + "T12:00:00",
  ).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: PH_TZ,
  });
  document.getElementById("copyModalSubtitle").textContent =
    `${sourceLabel} → ${targetLabel}`;

  renderCopyBudgetList(sourceBudgets, currentMonthStr);
  document.getElementById("copyBudgetModal").style.display = "block";
  preventBodyScroll();
}

function renderCopyBudgetList(sourceBudgets, targetMonth) {
  const existingCats = new Set(
    budgets.filter((b) => b.month === targetMonth).map((b) => b.category),
  );
  let html = "";
  sourceBudgets.forEach((b) => {
    const icon =
      expenseCategories.find((c) => c.name === b.category)?.icon || "💰";
    const alreadyExists = existingCats.has(b.category);
    const isSelected = copyBudgetSelectedIds.has(b.id);
    html += `
                    <div class="copy-modal-item${isSelected ? " selected" : ""}" onclick="toggleCopyBudgetItem(${b.id})" data-budget-id="${b.id}">
                        <!-- CHANGED: FA check icon replaces ✓ text in copy modal checkbox -->
                        <div class="copy-modal-checkbox">${isSelected ? '<i class="fa-solid fa-check"></i>' : ""}</div>
                        <div style="font-size:22px;">${icon}</div>
                        <div class="copy-modal-item-info">
                            <div class="copy-modal-item-name">${b.category}${alreadyExists ? ' <span style="color:var(--gold);font-size:11px;">(will update)</span>' : ""}</div>
                            <div class="copy-modal-item-limit">Limit: ${getCurrencySymbol()}${fmtNum(b.limit)}</div>
                        </div>
                    </div>`;
  });
  document.getElementById("copyBudgetList").innerHTML = html;
  document.getElementById("copySelectedCount").textContent =
    copyBudgetSelectedIds.size;
}

function _getSourceBudgets() {
  const cy = currentBudgetMonth.getFullYear(); // FIX BUG 2
  const cm = String(currentBudgetMonth.getMonth() + 1).padStart(2, "0"); // FIX BUG 2
  const currentMonthStr = `${cy}-${cm}`;
  const availableMonths = [...new Set(budgets.map((b) => b.month))]
    .filter((m) => m !== currentMonthStr)
    .sort()
    .reverse();
  // FIX BUG 6: guard against empty availableMonths — avoids filtering on undefined
  if (!availableMonths.length) return { sourceBudgets: [], currentMonthStr };
  return {
    sourceBudgets: budgets.filter((b) => b.month === availableMonths[0]),
    currentMonthStr,
  };
}

function toggleCopyBudgetItem(budgetId) {
  if (copyBudgetSelectedIds.has(budgetId))
    copyBudgetSelectedIds.delete(budgetId);
  else copyBudgetSelectedIds.add(budgetId);
  const { sourceBudgets, currentMonthStr } = _getSourceBudgets();
  renderCopyBudgetList(sourceBudgets, currentMonthStr);
}

function copyBudgetSelectAll() {
  const { sourceBudgets, currentMonthStr } = _getSourceBudgets();
  sourceBudgets.forEach((b) => copyBudgetSelectedIds.add(b.id));
  renderCopyBudgetList(sourceBudgets, currentMonthStr);
}

function copyBudgetClearAll() {
  copyBudgetSelectedIds.clear();
  const { sourceBudgets, currentMonthStr } = _getSourceBudgets();
  renderCopyBudgetList(sourceBudgets, currentMonthStr);
}

function confirmCopyBudgets() {
  if (copyBudgetSelectedIds.size === 0) {
    showValidationModal(["Select at least one category to copy"]);
    return;
  }
  const cy = currentBudgetMonth.getFullYear(); // FIX BUG 2
  const cm = String(currentBudgetMonth.getMonth() + 1).padStart(2, "0"); // FIX BUG 2
  const currentMonthStr = `${cy}-${cm}`;
  let copiedCount = 0,
    updatedCount = 0;

  copyBudgetSelectedIds.forEach((budgetId) => {
    const source = budgets.find((b) => b.id === budgetId);
    if (!source) return;
    const existing = budgets.find(
      (b) => b.month === currentMonthStr && b.category === source.category,
    );
    if (existing) {
      existing.limit = source.limit;
      updatedCount++;
    } else {
      budgets.push({
        id: Date.now() + Math.random(),
        category: source.category,
        limit: source.limit,
        month: currentMonthStr,
      });
      copiedCount++;
    }
  });

  saveData();
  updateUI();
  closeCopyBudgetModal();
  const parts = [];
  if (copiedCount > 0) parts.push(`${copiedCount} added`);
  if (updatedCount > 0) parts.push(`${updatedCount} updated`);
  showNotification(
    '<i class="fa-solid fa-circle-check"></i>',
    "Budgets Copied",
    [parts.join(", ")],
  );
}

// FIX: overlay-click guard was inverted — correctly block only when a child was clicked
function closeCopyBudgetModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("copyBudgetModal").style.display = "none";
  copyBudgetSelectedIds.clear();
  allowBodyScroll();
}

// ── Swipe-to-Reveal ───────────────────────────────────────────
let currentOpenSwipeWrapper = null;

function closeAllSwipeRows() {
  if (currentOpenSwipeWrapper) {
    currentOpenSwipeWrapper.classList.remove("open");
    currentOpenSwipeWrapper = null;
  }
}

// One global handler on document — works even when sections are display:none on init
let _swipeGlobalAttached = false;

function initSwipeListeners(scope) {
  // Reset open row whenever a list re-renders
  currentOpenSwipeWrapper = null;
  if (_swipeGlobalAttached) return;
  _swipeGlobalAttached = true;

  const PANEL_W = 120; // must match CSS width of .swipe-actions

  function getWrapper(target) {
    return target.closest(
      ".swipe-wrapper, .account-swipe-wrapper, .category-swipe-wrapper, .detail-swipe-wrapper",
    );
  }

  // ── helpers ────────────────────────────────────────────────────
  function getContent(wrapper) {
    return wrapper.querySelector(".swipe-content");
  }
  function getActions(wrapper) {
    return wrapper.querySelector(".swipe-actions");
  }

  function openWrapper(wrapper) {
    if (currentOpenSwipeWrapper && currentOpenSwipeWrapper !== wrapper) {
      closeWrapper(currentOpenSwipeWrapper);
    }
    wrapper.classList.add("open");
    currentOpenSwipeWrapper = wrapper;
  }

  function closeWrapper(wrapper) {
    wrapper.classList.remove("open");
    // clear any inline live-drag transforms so CSS transition takes over
    const c = getContent(wrapper);
    const a = getActions(wrapper);
    if (c) c.style.transform = "";
    if (a) a.style.transform = "";
    if (currentOpenSwipeWrapper === wrapper) currentOpenSwipeWrapper = null;
  }

  // ── Touch (mobile) ─────────────────────────────────────────────
  let startX = 0,
    startY = 0;
  let activeWrapper = null;
  let isHorizontal = null; // null = undecided, true/false once determined
  let wasOpen = false; // was the wrapper already open when touch started?

  document.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      activeWrapper = getWrapper(e.target);
      isHorizontal = null;
      wasOpen = activeWrapper
        ? activeWrapper.classList.contains("open")
        : false;

      // Close any open row tapped outside
      if (
        currentOpenSwipeWrapper &&
        (!activeWrapper || !currentOpenSwipeWrapper.contains(e.target))
      ) {
        closeWrapper(currentOpenSwipeWrapper);
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!activeWrapper) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      // Determine axis once we have enough movement
      if (isHorizontal === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!isHorizontal) return;

      e.preventDefault(); // lock scroll during horizontal swipe

      const content = getContent(activeWrapper);
      const actions = getActions(activeWrapper);
      if (!content || !actions) return;

      activeWrapper.classList.add("dragging");

      // Offset from the "resting" position (open = -PANEL_W, closed = 0)
      const base = wasOpen ? -PANEL_W : 0;
      let offset = base + dx;

      // Clamp: can't slide more than fully open or past center
      offset = Math.max(-PANEL_W, Math.min(0, offset));

      // Live-follow finger
      content.style.transform = `translateX(${offset}px)`;
      const actionPct = -offset / PANEL_W; // 0 → 1
      actions.style.transform = `translateX(${(1 - actionPct) * 100}%)`;
    },
    { passive: false },
  );

  document.addEventListener("touchend", (e) => {
    if (!activeWrapper || isHorizontal === false) {
      activeWrapper = null;
      isHorizontal = null;
      return;
    }

    activeWrapper.classList.remove("dragging");

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Clear inline styles — CSS transition will animate to final state
    const content = getContent(activeWrapper);
    const actions = getActions(activeWrapper);
    if (content) content.style.transform = "";
    if (actions) actions.style.transform = "";

    // Only act if clearly horizontal
    if (Math.abs(dy) < Math.abs(dx) || Math.abs(dx) >= 30) {
      if (dx < -30) {
        openWrapper(activeWrapper);
      } else if (dx > 15) {
        closeWrapper(activeWrapper);
      } else if (wasOpen) {
        // small movement while open — snap back open
        activeWrapper.classList.add("open");
        currentOpenSwipeWrapper = activeWrapper;
      }
    }

    activeWrapper = null;
    isHorizontal = null;
  });

  // ── Mouse (desktop / PWA) ──────────────────────────────────────
  let mouseStartX = 0,
    mouseStartY = 0;
  let mouseWrapper = null;
  let mouseWasOpen = false;
  let mouseDragging = false;

  document.addEventListener("mousedown", (e) => {
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    mouseWrapper = getWrapper(e.target);
    mouseWasOpen = mouseWrapper
      ? mouseWrapper.classList.contains("open")
      : false;
    mouseDragging = false;

    if (
      currentOpenSwipeWrapper &&
      (!mouseWrapper || !currentOpenSwipeWrapper.contains(e.target))
    ) {
      closeWrapper(currentOpenSwipeWrapper);
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!mouseWrapper) return;
    const dx = e.clientX - mouseStartX;
    const dy = e.clientY - mouseStartY;
    if (!mouseDragging && Math.abs(dx) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) return; // vertical — ignore

    mouseDragging = true;
    const content = getContent(mouseWrapper);
    const actions = getActions(mouseWrapper);
    if (!content || !actions) return;

    mouseWrapper.classList.add("dragging");
    const base = mouseWasOpen ? -PANEL_W : 0;
    let offset = Math.max(-PANEL_W, Math.min(0, base + dx));
    content.style.transform = `translateX(${offset}px)`;
    const pct = -offset / PANEL_W;
    actions.style.transform = `translateX(${(1 - pct) * 100}%)`;
  });

  document.addEventListener("mouseup", (e) => {
    if (!mouseWrapper) return;
    mouseWrapper.classList.remove("dragging");

    const content = getContent(mouseWrapper);
    const actions = getActions(mouseWrapper);
    if (content) content.style.transform = "";
    if (actions) actions.style.transform = "";

    if (mouseDragging) {
      const dx = e.clientX - mouseStartX;
      if (dx < -30) openWrapper(mouseWrapper);
      else if (dx > 15) closeWrapper(mouseWrapper);
      else if (mouseWasOpen) {
        mouseWrapper.classList.add("open");
        currentOpenSwipeWrapper = mouseWrapper;
      }
    }

    mouseWrapper = null;
    mouseDragging = false;
  });
}

// ── Edit Transaction ──────────────────────────────────────────
function editTransaction(id) {
  editingTransactionId = id;
  const txn = transactions.find((t) => t.id === id);
  if (!txn) return;
  // FIX: Restore interactivity in case selector previously left it locked
  const inputModal = document.getElementById("inputModal");
  inputModal.style.opacity = "1";
  inputModal.style.pointerEvents = "auto";
  document.getElementById("accountSelectorModal").classList.remove("active");

  document.getElementById("modalTitle").textContent =
    `Edit ${txn.type.charAt(0).toUpperCase() + txn.type.slice(1)} — ${getCurrencySymbol()}${fmtNum(txn.amount)}`;
  document.getElementById("inputModal").classList.add("active");

  calcExpression = "0";
  document.getElementById("txnNotes").value = "";

  const typeButtons = document.querySelectorAll(".tab-btn");
  typeButtons.forEach((btn) => btn.classList.remove("active"));
  // FIXED: match by text content instead of fragile index — safe against DOM changes
  if (txn.type === "income") {
    typeButtons.forEach((b) => {
      if (b.textContent.includes("INCOME")) b.classList.add("active");
    });
    currentTransactionType = "income";
    document.getElementById("incomeExpenseForm").style.display = "block";
    document.getElementById("transferForm").style.display = "none";
  } else if (txn.type === "expense") {
    typeButtons.forEach((b) => {
      if (b.textContent.includes("EXPENSE")) b.classList.add("active");
    });
    currentTransactionType = "expense";
    document.getElementById("incomeExpenseForm").style.display = "block";
    document.getElementById("transferForm").style.display = "none";
  } else {
    typeButtons.forEach((b) => {
      if (b.textContent.includes("TRANSFER")) b.classList.add("active");
    });
    currentTransactionType = "transfer";
    document.getElementById("incomeExpenseForm").style.display = "none";
    document.getElementById("transferForm").style.display = "block";
  }

  if (txn.type === "transfer") {
    const fromAcc = accounts.find((a) => a.id === txn.from);
    const toAcc = accounts.find((a) => a.id === txn.to);
    // UPDATED: prefill with icon+name using shared helper
    if (fromAcc) {
      _setSelectedAccount("transferFromText", fromAcc);
      document.getElementById("transferFromDisplay").dataset.accountId =
        fromAcc.id;
    }
    if (toAcc) {
      _setSelectedAccount("transferToText", toAcc);
      document.getElementById("transferToDisplay").dataset.accountId = toAcc.id;
    }
  } else {
    const acc = accounts.find((a) => a.id === txn.accountId);
    // UPDATED: prefill account with icon+name
    if (acc) {
      _setSelectedAccount("txnAccountText", acc);
      document.getElementById("txnAccountDisplay").dataset.accountId = acc.id;
    }
    const _allCats = [...incomeCategories, ...expenseCategories];
    const _editCat = _allCats.find((c) => c.name === txn.category);
    // UPDATED: prefill category with icon+name
    _setSelectedCategory("txnCategoryText", _editCat, txn.category);
    document.getElementById("txnCategoryDisplay").dataset.categoryId = _editCat
      ? String(_editCat.id)
      : "";
  }

  const dtStr = txn.date;
  if (dtStr && dtStr.includes("T")) {
    document.getElementById("txnDate").value = dtStr.split("T")[0];
    document.getElementById("txnTime").value = dtStr
      .split("T")[1]
      .substring(0, 5);
  } else {
    document.getElementById("txnDate").value = dtStr
      ? dtStr.substring(0, 10)
      : "";
  }
  document.getElementById("txnNotes").value = txn.notes || "";
  // Preserve the exact decimal representation stored — don't use parseFloat which strips trailing zeros
  const amountStr = String(txn.amount);
  document.getElementById("modalCalcDisplay").textContent = amountStr;
  calcExpression = amountStr;
}

// ── Save Transaction ──────────────────────────────────────────
function saveTransaction() {
  // Auto-evaluate pending expression
  // FIXED: skip eval entirely if display shows 'Error' — prevents eval('Error') throwing and blocking save silently
  try {
    const raw = document.getElementById("modalCalcDisplay").textContent;
    if (raw === "Error") {
      document.getElementById("modalCalcDisplay").textContent = "0";
      calcExpression = "0";
    } else if (/[+\-*/]/.test(raw)) {
      // FIXED: sanitize before eval — only allow digits, operators, dots, parentheses
      if (/^[0-9+\-*/.() ]+$/.test(raw)) {
        const result = parseFloat(eval(raw)); // eslint-disable-line no-eval
        // FIX C1: isFinite guards against Infinity (1/0) which passes isNaN but corrupts data
        if (!isNaN(result) && isFinite(result)) {
          // FIX M6: eliminate floating-point noise (0.1+0.2 → 0.30, not 0.30000000000000004)
          calcExpression = String(parseFloat(result.toFixed(10)));
          document.getElementById("modalCalcDisplay").textContent =
            calcExpression;
        }
      }
    }
  } catch (e) {
    document.getElementById("modalCalcDisplay").textContent = "0";
    calcExpression = "0";
  }

  const amount = parseFloat(
    document.getElementById("modalCalcDisplay").textContent,
  );
  const date = document.getElementById("txnDate").value;
  const time = document.getElementById("txnTime").value;
  const notes = document.getElementById("txnNotes").value;

  const missing = [];
  // FIX C1: isFinite blocks Infinity (e.g. 1/0) which passes !amount and amount>0 checks
  if (!amount || amount <= 0 || !isFinite(amount)) missing.push("Amount");
  if (!date) missing.push("Date");
  if (!time) missing.push("Time");
  if (missing.length > 0) {
    showValidationModal(missing);
    return;
  }

  if (currentTransactionType === "transfer") {
    const fromAccountText =
      document.getElementById("transferFromText").textContent;
    const toAccountText = document.getElementById("transferToText").textContent;
    const missingAccs = [];
    if (fromAccountText === "Select Account") missingAccs.push("From Account");
    if (toAccountText === "Select Account") missingAccs.push("To Account");
    if (missingAccs.length > 0) {
      showValidationModal(missingAccs);
      return;
    }

    // FIXED: resolve account by dataset ID (reliable) then name fallback; stale icon+name match removed
    const fromAccId = document.getElementById("transferFromDisplay").dataset
      .accountId;
    const toAccId =
      document.getElementById("transferToDisplay").dataset.accountId;
    const fromAccount =
      accounts.find((a) => String(a.id) === String(fromAccId)) ||
      accounts.find((a) => a.name === fromAccountText);
    const toAccount =
      accounts.find((a) => String(a.id) === String(toAccId)) ||
      accounts.find((a) => a.name === toAccountText);
    if (!fromAccount || !toAccount) {
      showValidationModal(["Invalid account selection"]);
      return;
    }
    // FIX BUG 3: compare resolved account IDs instead of textContent (textContent can include emoji prefix, making same-account check unreliable)
    if (fromAccount.id === toAccount.id) {
      showValidationModal(["From and To accounts must be different"]);
      return;
    }

    const dateTime = `${date}T${time}`;
    if (editingTransactionId) {
      const txn = transactions.find((t) => t.id === editingTransactionId);
      if (txn) {
        txn.amount = amount;
        txn.from = fromAccount.id;
        txn.to = toAccount.id;
        txn.date = dateTime;
        txn.notes = notes || "";
      }
    } else {
      transactions.push({
        id: Date.now(),
        type: "transfer",
        amount,
        from: fromAccount.id,
        to: toAccount.id,
        notes: notes || "",
        date: dateTime,
      });
    }

    saveData();
    updateUI();
    const wasEditing = !!editingTransactionId;
    closeModal();
    showNotification(
      '<i class="fa-solid fa-circle-check"></i>',
      wasEditing ? "Transfer Updated" : "Transfer Saved",
      [
        `<span class="notification-amount">Amount: ${getCurrencySymbol()}${fmtNum(amount)}</span>`,
        `From: ${fromAccount.name}`,
        `To: ${toAccount.name}`,
      ],
    );
  } else {
    const accountText = document.getElementById("txnAccountText").textContent;
    const rawCategoryText =
      document.getElementById("txnCategoryText").textContent;
    // Resolve to clean category name: use dataset.categoryId to look up, else strip icon prefix
    const catId =
      document.getElementById("txnCategoryDisplay").dataset.categoryId;
    const catsForType =
      currentTransactionType === "income"
        ? incomeCategories
        : expenseCategories;
    const matchedCat = catId
      ? catsForType.find((c) => String(c.id) === String(catId))
      : null;
    // If no id match, strip the icon prefix (first non-space token) from display text
    let categoryText;
    if (matchedCat) {
      categoryText = matchedCat.name;
    } else {
      // Try to find by icon+name pattern: "🍽️ Food" -> "Food"
      const foundByDisplay = catsForType.find(
        (c) => rawCategoryText === c.icon + " " + c.name,
      );
      categoryText = foundByDisplay ? foundByDisplay.name : rawCategoryText;
    }
    const missingFields = [];
    if (accountText === "Select Account") missingFields.push("Account");
    if (!categoryText || categoryText === "Select Category")
      missingFields.push("Category");
    if (missingFields.length > 0) {
      showValidationModal(missingFields);
      return;
    }

    // FIXED: resolve account by dataset ID (reliable) then name fallback; stale icon+name match removed
    const accId =
      document.getElementById("txnAccountDisplay").dataset.accountId;
    const account =
      accounts.find((a) => String(a.id) === String(accId)) ||
      accounts.find((a) => a.name === accountText);
    if (!account) {
      showValidationModal(["Invalid account selection"]);
      return;
    }

    const dateTime = `${date}T${time}`;
    if (editingTransactionId) {
      const txn = transactions.find((t) => t.id === editingTransactionId);
      if (txn) {
        txn.type = currentTransactionType;
        txn.amount = amount;
        txn.accountId = account.id;
        txn.category = categoryText;
        txn.notes = notes || "";
        txn.date = dateTime;
      }
    } else {
      transactions.push({
        id: Date.now(),
        type: currentTransactionType,
        amount,
        accountId: account.id,
        category: categoryText,
        notes: notes || "",
        date: dateTime,
      });
    }

    saveData();
    updateUI();
    // UPDATED: expense notification icon — FA icons match rest of notification system
    const typeIcon =
      currentTransactionType === "income"
        ? '<i class="fa-solid fa-circle-arrow-up" style="color:var(--income)"></i>'
        : '<i class="fa-solid fa-circle-arrow-down" style="color:var(--expense)"></i>';
    const typeName = currentTransactionType === "income" ? "Income" : "Expense";
    const amtClass = currentTransactionType === "income" ? "income" : "expense";
    const wasEditing = !!editingTransactionId;
    closeModal();
    showNotification(
      typeIcon,
      `${typeName} ${wasEditing ? "Updated" : "Saved"}`,
      [
        `<span class="notification-amount ${amtClass}">${getCurrencySymbol()}${fmtNum(amount)}</span>`,
        `Account: ${account.name}`,
        `Category: ${categoryText}`,
      ],
    );
  }
}

// ── Account Balances ──────────────────────────────────────────
function updateAccountBalances() {
  accounts.forEach((acc) => {
    acc.balance =
      typeof acc.initialBalance === "number" ? acc.initialBalance : 0;
  });
  transactions.forEach((txn) => {
    if (txn.type === "transfer") {
      const from = accounts.find((a) => a.id === txn.from);
      const to = accounts.find((a) => a.id === txn.to);
      if (from) from.balance -= txn.amount;
      if (to) to.balance += txn.amount;
    } else {
      const acc = accounts.find((a) => a.id === txn.accountId);
      if (acc) acc.balance += txn.type === "income" ? txn.amount : -txn.amount;
    }
  });
}

function deleteTransaction(id) {
  const txn = transactions.find((t) => t.id === id);
  if (!txn) return;
  let desc = "";
  if (txn.type === "transfer") {
    const from = accounts.find((a) => a.id === txn.from);
    const to = accounts.find((a) => a.id === txn.to);
    desc = `<strong>Transfer</strong> — ${getCurrencySymbol()}${fmtNum(txn.amount)}<br>${from?.name || "Unknown"} → ${to?.name || "Unknown"}`;
  } else {
    const acc = accounts.find((a) => a.id === txn.accountId);
    const type = txn.type === "income" ? "Income" : "Expense";
    desc = `<strong>${type}</strong> — ${getCurrencySymbol()}${fmtNum(txn.amount)}<br>${txn.category} · ${acc?.name || "Unknown"}`;
  }
  showDeleteModal("", "Delete Transaction?", desc, () => {
    transactions = transactions.filter((t) => t.id !== id);
    saveData();
    updateUI();
    showNotification(
      '<i class="fa-solid fa-circle-check"></i>',
      "Transaction Deleted",
      ["Successfully removed from records"],
    );
  });
}

// ── Save Account ──────────────────────────────────────────────
function saveAccount() {
  const name = document.getElementById("accountName").value.trim();
  const initialBalance = parseFloat(
    document.getElementById("accountBalance").value,
  );
  const rawIcon = document.getElementById("accountIcon").value.trim();

  // Validate name and balance first
  if (!name || isNaN(initialBalance)) {
    showValidationModal(
      [
        !name ? "Account Name" : null,
        isNaN(initialBalance) ? "Initial Balance" : null,
      ].filter(Boolean),
    );
    return;
  }
  // FIX M1: HTML min="0" is not enforced on all Android keyboards — validate in JS
  if (initialBalance < 0) {
    showValidationModal(["Initial Balance cannot be negative"]);
    return;
  }

  // UPDATED: Validate icon — must be a selected PNG filename
  if (!rawIcon) {
    showValidationModal(["Account Icon"]);
    return;
  }
  const icon = rawIcon;

  if (editingAccountId) {
    const account = accounts.find((a) => a.id === editingAccountId);
    if (account) {
      // Duplicate name check (exclude current account)
      const duplicate = accounts.find(
        (a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== editingAccountId
      );
      if (duplicate) {
        showValidationModal([`Account name "${name}" already exists`]);
        return;
      }
      account.name = name;
      account.initialBalance = initialBalance;
      account.icon = icon;
      saveData();
      updateUI();
      closeAccountModal();
      showNotification(
        '<i class="fa-solid fa-circle-check"></i>',
        "Account Updated",
        [
          `${name}`,
          `Starting Balance: <span class="notification-amount">${getCurrencySymbol()}${fmtNum(initialBalance)}</span>`,
        ],
      );
    }
  } else {
    // Duplicate name check for new account
    const duplicate = accounts.find(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      showValidationModal([`Account name "${name}" already exists`]);
      return;
    }
    accounts.push({
      id: Date.now(),
      name,
      initialBalance,
      balance: initialBalance,
      icon,
    });
    saveData();
    updateUI();
    closeAccountModal();
    showNotification(
      '<i class="fa-solid fa-circle-check"></i>',
      "Account Added",
      [
        `${name}`,
        `Starting Balance: <span class="notification-amount">${getCurrencySymbol()}${fmtNum(initialBalance)}</span>`,
      ],
    );
  }
}

// UPDATED: error dialog for missing icon selection
function showAccountInvalidIconDialog() {
  const list = document.getElementById("validationModalList");
  list.innerHTML = `
                <div class="validation-field-item">
                    <span class="validation-field-bullet"><i class="fa-solid fa-triangle-exclamation"></i></span>
                    <span class="validation-field-text">
                        Please select an icon for the account.<br>
                        <span style="color:var(--text-muted);font-size:12px;">Tap one of the icons in the grid above.</span>
                    </span>
                </div>`;
  document.getElementById("validationModalTitle").textContent = "Icon Required";
  document.getElementById("validationModal").style.display = "block";
}

function deleteAccount(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  // Use emoji only — img tags in WebView modals get opened as images on tap
  const iconLabel =
    acc.icon && !acc.icon.toLowerCase().endsWith(".png") ? acc.icon : "🏦";
  // FIXED: count affected transactions and warn user before deleting
  const affectedCount = transactions.filter(
    (t) => t.accountId === id || t.from === id || t.to === id,
  ).length;
  const warningLine =
    affectedCount > 0
      ? `<br><span style="color:var(--expense);font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> ${affectedCount} transaction(s) using this account will also be deleted and balances restored.</span>`
      : "";
  showDeleteModal(
    "",
    "Delete Account?",
    `<strong>${acc.name}</strong>${warningLine}`,
    () => {
      // FIXED: remove all transactions that reference this account
      transactions = transactions.filter(
        (t) => t.accountId !== id && t.from !== id && t.to !== id,
      );
      accounts = accounts.filter((a) => a.id !== id);
      updateAccountBalances();
      saveData();
      updateUI();
      const detail =
        affectedCount > 0
          ? [
              `${acc.name} removed`,
              `${affectedCount} transaction(s) deleted, balances restored`,
            ]
          : [`${acc.name} removed`];
      showNotification(
        '<i class="fa-solid fa-circle-check"></i>',
        "Account Deleted",
        detail,
      );
    },
  );
}

// ── Save Category ─────────────────────────────────────────────
// ── Unicode-safe emoji validation ─────────────────────────────
function getGraphemes(str) {
  // Use Intl.Segmenter when available (Chrome 87+, Safari 15.4+, Firefox 125+)
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(str)].map((s) => s.segment);
  }
  // Fallback: spread by Unicode code points (handles surrogates but not ZWJ sequences)
  return [...str];
}

function isValidEmoji(str) {
  const s = str.trim();
  if (!s) return false;
  const graphemes = getGraphemes(s);
  // Must resolve to exactly one grapheme cluster
  if (graphemes.length !== 1) return false;
  const g = graphemes[0];
  // Must contain at least one emoji/extended-pictographic codepoint
  // This regex matches: emoji, regional indicators (flags), dingbats, symbols
  const emojiRegex = /\p{Emoji}/u;
  // Must NOT be a plain ASCII character (numbers, letters, punctuation)
  const plainAscii = /^[\x20-\x7E]$/;
  // Regional indicator pairs form flags (e.g. 🇵🇭)
  const regionalIndicator = /^\p{RI}\p{RI}$/u;
  if (regionalIndicator.test(g)) return true;
  if (plainAscii.test(g)) return false;
  return emojiRegex.test(g);
}

function showInvalidIconDialog() {
  // Reuse the validation modal with a specific message
  const list = document.getElementById("validationModalList");
  list.innerHTML = `
                <div class="validation-field-item">
                    <span class="validation-field-bullet"><i class="fa-solid fa-triangle-exclamation"></i></span>
                    <span class="validation-field-text">
                       Only one icon is allowed.
                    </span>
                </div>`;
  document.getElementById("validationModalTitle").textContent = "Invalid Icon";
  document.getElementById("validationModal").style.display = "block";
}

function saveCategory() {
  const name = document.getElementById("categoryName").value.trim();
  const icon = document.getElementById("categoryIcon").value.trim();
  const type = document.getElementById("categoryType").value;

  // Validate name
  if (!name) {
    showValidationModal(["Category Name"]);
    return;
  }

  // Validate icon — must be a single valid emoji grapheme cluster
  if (!icon) {
    showValidationModal(["Category Icon"]);
    return;
  }
  if (!isValidEmoji(icon)) {
    showInvalidIconDialog();
    return;
  }

  // Store the full grapheme cluster (supports flags, ZWJ sequences, skin tones)
  const safeIcon = getGraphemes(icon)[0];

  if (editingCategoryId) {
    const cats = type === "income" ? incomeCategories : expenseCategories;
    const cat = cats.find((c) => c.id === editingCategoryId);
    if (cat) {
      // Duplicate name check (exclude current category)
      const duplicate = cats.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCategoryId
      );
      if (duplicate) {
        showValidationModal([`Category name "${name}" already exists`]);
        return;
      }
      // FIXED: store old name before update
      const oldName = cat.name;
      cat.name = name;
      cat.icon = safeIcon;

      // FIXED: update records after category edit
      transactions.forEach((tx) => {
        if (!tx.category) return;
        if (tx.category === oldName) {
          tx.category = name;
        }
      });

      // FIXED: update budgets after category rename
      budgets.forEach((b) => {
        if (!b.category) return;
        if (b.category === oldName) {
          b.category = name;
        }
      });

      // FIXED: update active filter if it points to the renamed category
      if (activeFilter.type === "category" && activeFilter.value === oldName) {
        activeFilter.value = name;
        activeFilter.label = safeIcon + " " + name;
        renderFilterBanner();
      }

      saveData();
      updateUI();
      closeCategoryModal();
      showNotification(
        '<i class="fa-solid fa-circle-check"></i>',
        "Category Updated",
        [
          `${safeIcon} ${name}`,
          `Type: ${type === "income" ? "Income" : "Expense"}`,
        ],
      );
    }
  } else {
    // Duplicate name check for new category (within same type)
    const catList = type === "income" ? incomeCategories : expenseCategories;
    const duplicate = catList.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      showValidationModal([`Category name "${name}" already exists`]);
      return;
    }
    if (type === "income")
      incomeCategories.push({ id: Date.now(), name, icon: safeIcon });
    else expenseCategories.push({ id: Date.now(), name, icon: safeIcon });
    saveData();
    updateUI();
    // If opened from budget sheet, auto-select the new expense category
    if (categoryOpenedFromBudgetSheet && type === "expense") {
      document.getElementById("budgetCategory").value = name;
      const text = document.getElementById("budgetCategoryText");
      if (text) text.textContent = safeIcon + " " + name;
    }
    // If opened from transaction category sheet, auto-select the new category
    if (categoryOpenedFromTransaction) {
      const newCat = (
        type === "income" ? incomeCategories : expenseCategories
      ).find((c) => c.name === name);
      const catId = newCat ? newCat.id : Date.now();
      // UPDATED: use helper to show icon+name in selected-item
      _setSelectedCategory("txnCategoryText", newCat, name);
      document.getElementById("txnCategoryDisplay").dataset.categoryId = catId;
    }
    closeCategoryModal();
    showNotification(
      '<i class="fa-solid fa-circle-check"></i>',
      "Category Added",
      [
        `${safeIcon} ${name}`,
        `Type: ${type === "income" ? "Income" : "Expense"}`,
      ],
    );
  }
}

function deleteCategory(id, type) {
  const cats = type === "income" ? incomeCategories : expenseCategories;
  const cat = cats.find((c) => c.id === id);
  if (!cat) return;
  const affectedCount = transactions.filter(
    (t) => t.type === type && t.category === cat.name,
  ).length;
  const warningLine =
    affectedCount > 0
      ? `<br><span style="color:#e05555;font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> ${affectedCount} transaction(s) using this category will also be deleted and balances restored.</span>`
      : "";
  showDeleteModal(
    "",
    "Delete Category?",
    `<strong>${cat.icon} ${cat.name}</strong><br>Type: ${type === "income" ? "Income" : "Expense"}${warningLine}`,
    () => {
      transactions = transactions.filter(
        (t) => !(t.type === type && t.category === cat.name),
      );
      if (type === "income")
        incomeCategories = incomeCategories.filter((c) => c.id !== id);
      else expenseCategories = expenseCategories.filter((c) => c.id !== id);
      updateAccountBalances();
      saveData();
      updateUI();
      const detail =
        affectedCount > 0
          ? [
              `${cat.icon} ${cat.name} removed`,
              `${affectedCount} transaction(s) deleted, balances restored`,
            ]
          : [`${cat.icon} ${cat.name} removed`];
      showNotification(
        '<i class="fa-solid fa-trash-can"></i>',
        "Category Deleted",
        detail,
      );
    },
  );
}

// ── Save Budget ───────────────────────────────────────────────
function saveBudget() {
  const category = document.getElementById("budgetCategory").value;
  const limit = parseFloat(document.getElementById("budgetLimit").value);
  const month = document.getElementById("budgetMonth").value;
  const errors = [];
  if (!category) errors.push("Category (tap a tile to select)");
  if (isNaN(limit) || limit <= 0) errors.push("Budget Limit (must be > 0)");
  if (!month) errors.push("Month");
  if (errors.length > 0) {
    showValidationModal(errors);
    return;
  }

  if (editingBudgetId) {
    const budget = budgets.find((b) => b.id === editingBudgetId);
    if (budget) {
      budget.category = category;
      budget.limit = limit;
      budget.month = month;
      saveData();
      updateUI();
      closeBudgetModal();
      const catIcon =
        expenseCategories.find((c) => c.name === category)?.icon || "💰";
      // FIX M3: noon local time prevents UTC-midnight timezone shift in month display
      const monthFmt = new Date(month + "T12:00:00").toLocaleDateString(
        "en-US",
        {
          month: "short",
          year: "numeric",
          timeZone: PH_TZ,
        },
      );
      showNotification(
        '<i class="fa-solid fa-circle-check"></i>',
        "Budget Updated",
        [
          `${catIcon} ${category}`,
          `Limit: <span class="notification-amount">${getCurrencySymbol()}${fmtNum(limit)}</span>`,
          `Month: ${monthFmt}`,
        ],
      );
    }
  } else {
    // FIX C2: prevent duplicate budget for same category + month
    const existingBudget = budgets.find(
      (b) => b.category === category && b.month === month,
    );
    if (existingBudget) {
      showValidationModal([
        `A budget for "${category}" in this month already exists. Edit it instead.`,
      ]);
      return;
    }
    budgets.push({ id: Date.now(), category, limit, month });
    saveData();
    updateUI();
    closeBudgetModal();
    const catIcon =
      expenseCategories.find((c) => c.name === category)?.icon || "💰";
    // FIX M3: noon local time prevents UTC-midnight timezone shift in month display
    const monthFmt = new Date(month + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: PH_TZ,
    });
    showNotification(
      '<i class="fa-solid fa-circle-check"></i>',
      "Budget Added",
      [
        `${catIcon} ${category}`,
        `Limit: <span class="notification-amount">${getCurrencySymbol()}${fmtNum(limit)}</span>`,
        `Month: ${monthFmt}`,
      ],
    );
  }
}

function deleteBudget(id) {
  const budget = budgets.find((b) => b.id === id);
  if (!budget) return;
  const icon =
    expenseCategories.find((c) => c.name === budget.category)?.icon || "💰";
  // FIX M3: noon local time prevents UTC-midnight timezone shift in month display
  const monthFmt = new Date(budget.month + "T12:00:00").toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
      timeZone: PH_TZ,
    },
  );
  showDeleteModal(
    "💰",
    "Delete Budget?",
    `<strong>${icon} ${budget.category}</strong><br>Limit: ${getCurrencySymbol()}${fmtNum(budget.limit)} · ${monthFmt}`,
    () => {
      budgets = budgets.filter((b) => b.id !== id);
      saveData();
      updateUI();
      showNotification(
        '<i class="fa-solid fa-circle-check"></i>',
        "Budget Deleted",
        [`${icon} ${budget.category} removed`],
      );
    },
  );
}

// ── Calculator ────────────────────────────────────────────────
function appendModalCalc(value) {
  const DIGIT_LIMIT = 20;
  // Count digits only (ignore operators)
  const digitCount = (calcExpression.match(/\d/g) || []).length;

  // Handle 00 — append two zeros
  if (value === "00") {
    if (digitCount >= DIGIT_LIMIT - 1) return; // silently ignore at limit
    if (calcExpression === "0") return; // don't append 00 to bare 0
    // Don't allow 00 right after an operator
    if (/[+\-*/]$/.test(calcExpression)) return;
    const digitsToAdd = Math.min(2, DIGIT_LIMIT - digitCount);
    calcExpression += "0".repeat(digitsToAdd);
    document.getElementById("modalCalcDisplay").textContent = calcExpression;
    return;
  }

  // Handle operators — replace trailing operator instead of stacking
  const isOperator = /^[+\-*/]$/.test(value);
  if (isOperator) {
    if (/[+\-*/]$/.test(calcExpression)) {
      // Replace the last operator with the new one
      calcExpression = calcExpression.slice(0, -1) + value;
    } else {
      calcExpression += value;
    }
    document.getElementById("modalCalcDisplay").textContent = calcExpression;
    return;
  }

  // LIMIT: max 20 digits
  if (/\d/.test(value) && digitCount >= DIGIT_LIMIT) {
    return; // silently ignore — no modal pop-up for digit limit
  }

  // Handle % — divide current number by 100
  if (value === "%") {
    try {
      const current = parseFloat(calcExpression);
      if (!isNaN(current)) {
        calcExpression = String(parseFloat((current / 100).toFixed(10)));
        document.getElementById("modalCalcDisplay").textContent =
          calcExpression;
      }
    } catch (e) {
      /* ignore */
    }
    return;
  }

  // Don't allow multiple decimal points in the current number segment
  if (value === ".") {
    const segments = calcExpression.split(/[+\-*/]/);
    const currentSegment = segments[segments.length - 1];
    if (currentSegment.includes(".")) return;
  }

  if (calcExpression === "0" && value !== "." && !/[+\-*/]/.test(value)) {
    calcExpression = value;
  } else {
    calcExpression += value;
  }

  document.getElementById("modalCalcDisplay").textContent = calcExpression;
}

function clearModalCalc() {
  calcExpression = "0";
  document.getElementById("modalCalcDisplay").textContent = calcExpression;
}

function backspaceModalCalc() {
  if (calcExpression.length <= 1 || calcExpression === "Error") {
    calcExpression = "0";
  } else {
    calcExpression = calcExpression.slice(0, -1);
    if (calcExpression === "" || calcExpression === "-") {
      calcExpression = "0";
    }
  }
  document.getElementById("modalCalcDisplay").textContent = calcExpression;
}

function calculateModalResult() {
  try {
    // FIXED: sanitize expression before eval — guard against injected strings
    if (!/^[0-9+\-*/.() ]+$/.test(calcExpression)) {
      document.getElementById("modalCalcDisplay").textContent = "Error";
      return;
    }
    const rawResult = eval(calcExpression); // eslint-disable-line no-eval
    // FIX C1: block Infinity (e.g. 1/0) — passes isNaN but would corrupt account balances
    if (!isFinite(rawResult)) {
      document.getElementById("modalCalcDisplay").textContent = "Error";
      calcExpression = "0";
      return;
    }
    // FIX M6: parseFloat(toFixed(10)) eliminates IEEE 754 noise (0.1+0.2 → 0.30 not 0.30000000000000004)
    calcExpression = String(parseFloat(rawResult.toFixed(10)));
    document.getElementById("modalCalcDisplay").textContent = calcExpression;
  } catch (e) {
    document.getElementById("modalCalcDisplay").textContent = "Error";
  }
}

// ── Update UI ─────────────────────────────────────────────────
function updateUI() {
  updateAccountBalances();
  updateRecords();
  updateAnalysis();
  updateBudgets();
  updateAccounts();
  updateCategories();
}

function updateRecords() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  let monthTransactions = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  // UPDATED: apply active filter if set (account or category drill-down)
  if (activeFilter.type === "account") {
    // FIXED: use stored accountId if available, fall back to name lookup
    const accId =
      activeFilter.accountId ||
      (accounts.find((a) => a.name === activeFilter.value)?.id ?? null);
    if (accId !== null) {
      monthTransactions = monthTransactions.filter(
        (t) => t.accountId === accId || t.from === accId || t.to === accId,
      );
    }
  } else if (activeFilter.type === "category") {
    monthTransactions = monthTransactions.filter(
      (t) => t.category === activeFilter.value,
    );
  }
  renderTransactions(monthTransactions);

  // Monthly summary tiles
  const totalIncome = monthTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = monthTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpense;
  const sym = getCurrencySymbol();
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const setPfx = (id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  };
  setEl("rmsIncome", fmtNum(totalIncome));
  setEl("rmsExpense", fmtNum(totalExpense));
  setPfx("pfx-rmsIncome");
  setPfx("pfx-rmsExpense");
  const netEl = document.getElementById("rmsNet");
  if (netEl) {
    netEl.textContent = (net >= 0 ? "+" : "-") + sym + fmtNum(Math.abs(net));
    netEl.style.color = net >= 0 ? "var(--income)" : "var(--expense)";
  }
}

// UPDATED: filter by account — called from Accounts page card tap
function filterByAccount(accountName) {
  // FIXED: store account ID alongside name for reliable filtering regardless of duplicate names
  const _filterAcc = accounts.find((a) => a.name === accountName);
  activeFilter = {
    type: "account",
    value: accountName,
    label: accountName,
    accountId: _filterAcc ? _filterAcc.id : null,
  };
  showSection("records");
  updateRecords();
  renderFilterBanner();
}

// UPDATED: filter by category — called from Categories page row tap
function filterByCategory(categoryName, categoryIcon) {
  activeFilter = {
    type: "category",
    value: categoryName,
    label: `${categoryIcon} ${categoryName}`,
  };
  showSection("records");
  updateRecords();
  renderFilterBanner();
}

// UPDATED: clear active filter and restore normal records view
function clearFilter() {
  activeFilter = { type: null, value: null, label: null };
  updateRecords();
  renderFilterBanner();
}

// UPDATED: render/hide the filter indicator banner above transactions
function renderFilterBanner() {
  const banner = document.getElementById("filterBanner");
  if (!banner) return;
  if (activeFilter.type) {
    const typeLabel = activeFilter.type === "account" ? "Account" : "Category";
    banner.innerHTML = `
                    <span><i class="fa-solid fa-filter" style="margin-right:6px;font-size:11px;"></i>${typeLabel}: <strong>${activeFilter.label}</strong></span>
                    <button onclick="clearFilter()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:13px;padding:0 0 0 10px;" title="Clear filter"><i class="fa-solid fa-xmark"></i></button>`;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

function renderTransactions(toRender) {
  const container = document.getElementById("transactionsContainer");
  if (toRender.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><i class="fa-solid fa-receipt" style="font-size:48px;opacity:0.35;"></i><p>No transactions this month</p></div>';
    if (bulkMode) container.classList.add("bulk-mode");
    return;
  }

  // Group by date-only key (YYYY-MM-DD)
  const grouped = {};
  toRender.forEach((t) => {
    const key = t.date ? t.date.substring(0, 10) : "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  // Sort day-groups newest first
  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Within each day, sort by full datetime desc, then by id desc as tiebreaker
  // so the most recently ADDED transaction always appears at the top of its day
  sortedKeys.forEach((key) => {
    grouped[key].sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      // Same minute — use id (Date.now() ms) as tiebreaker: larger id = newer
      return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
    });
  });

  let html = "";
  sortedKeys.forEach((dateKey) => {
    const items = grouped[dateKey];
    const dateObj = new Date(dateKey + "T12:00:00");
    const dateStr = dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "long",
      timeZone: PH_TZ,
    });
    html += `<div class="transaction-date"><span>${dateStr}</span></div>`;

    items.forEach((t) => {
      // UPDATED: replaced arrow with category icon
      let bgClass = "icon-expense";
      let icon;
      if (t.type === "transfer") {
        icon = '<i class="fa-solid fa-right-left" aria-label="Transfer"></i>';
        bgClass = "icon-transfer";
      } else {
        // UPDATED: look up the category icon from existing category arrays; fall back to default emoji
        const allCats = [...incomeCategories, ...expenseCategories];
        const catObj = allCats.find((c) => c.name === t.category);
        const catIcon = catObj ? catObj.icon : "💰";
        icon = `<span aria-label="${t.category}">${catIcon}</span>`;
        bgClass = t.type === "income" ? "icon-income" : "icon-expense";
      }

      // FIX: Use block-level spans instead of <br> inside flex container
      let labelHTML = "";
      if (t.type === "transfer") {
        const fromObj = accounts.find((a) => a.id === t.from);
        const toObj = accounts.find((a) => a.id === t.to);
        const fromName = fromObj?.name || "Unknown";
        const toName = toObj?.name || "Unknown";
        // UPDATED: show icons for both from/to accounts in transfer records
        const fromIcon = fromObj?.icon?.toLowerCase().endsWith(".png")
          ? `<img src="images/${fromObj.icon}" class="record-account-icon" onerror="this.style.display='none'">`
          : `<span style="font-size:12px;line-height:1;">${fromObj?.icon || ""}</span>`;
        const toIcon = toObj?.icon?.toLowerCase().endsWith(".png")
          ? `<img src="images/${toObj.icon}" class="record-account-icon" onerror="this.style.display='none'">`
          : `<span style="font-size:12px;line-height:1;">${toObj?.icon || ""}</span>`;
        labelHTML = `<span class="txn-main-line">Transfer</span>
                            <span class="txn-sub-line record-transfer">
                                <span class="record-account">${fromIcon}<span>${fromName}</span></span>
                                <i class="fa-solid fa-arrow-right" style="font-size:9px;opacity:0.6;flex-shrink:0;"></i>
                                <span class="record-account">${toIcon}<span>${toName}</span></span>
                            </span>`;
      } else {
        const accObj = accounts.find((a) => a.id === t.accountId);
        const accName = accObj?.name || "Unknown";
        // FIXED: show account icon beside account name in records
        // FIXED: correct path is images/ not images/accounts/; also handle emoji icons
        const accIconHTML =
          accObj && accObj.icon && accObj.icon.toLowerCase().endsWith(".png")
            ? `<img src="images/${accObj.icon}" class="record-account-icon" onerror="this.style.display='none'">`
            : accObj && accObj.icon
              ? `<span style="font-size:13px;line-height:1;">${accObj.icon}</span>`
              : "";
        labelHTML = `<span class="txn-main-line">${t.category}</span>`;
        if (t.notes)
          labelHTML += `<span class="txn-sub-line txn-notes-inline">${t.notes.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`; // FIXED: sanitize notes HTML
        labelHTML += `<span class="txn-sub-line record-account">${accIconHTML}<span>${accName}</span></span>`;
      }

      let timeStr = "";
      if (t.date && t.date.includes("T")) {
        const tp = t.date.split("T")[1];
        if (tp) {
          const [hh, mm] = tp.substring(0, 5).split(":");
          let h = parseInt(hh);
          const ampm = h >= 12 ? "PM" : "AM";
          h = h % 12 || 12;
          timeStr = `<span class="txn-time">${h}:${mm} ${ampm}</span>`;
        }
      }

      // FIX: Use CSS variables for amount colour so light/dark mode is respected
      const amountColor =
        t.type === "income"
          ? "var(--income)"
          : t.type === "expense"
            ? "var(--expense)"
            : "var(--gold)";
      const amountSign =
        t.type === "income" ? "+" : t.type === "expense" ? "-" : "";
      const isSelected = selectedTxnIds.has(t.id);

      html += `
                        <div class="swipe-wrapper${isSelected ? " row-selected" : ""}" data-id="${t.id}" onclick="handleRowTap(${t.id}, this)">
                            <div class="swipe-actions">
                                <!-- CHANGED: FA icons replace text ✎/✕ in swipe actions -->
                                <button class="swipe-edit-btn"   aria-label="Edit"   title="Edit"   onclick="event.stopPropagation(); editTransaction(${t.id})"><span class="btn-icon"><i class="fa-solid fa-pen"></i></span></button>
                                <button class="swipe-delete-btn" aria-label="Delete" title="Delete" onclick="event.stopPropagation(); deleteTransaction(${t.id})"><span class="btn-icon"><i class="fa-solid fa-trash"></i></span></button>
                            </div>
                            <div class="swipe-content transaction-item" id="txn-${t.id}">
                                <!-- CHANGED: FA check icon in bulk-select checkbox -->
                                <div class="row-checkbox">${isSelected ? '<i class="fa-solid fa-check"></i>' : ""}</div>
                                <div class="transaction-icon ${bgClass}">${icon}</div>
                                <div class="transaction-details">
                                    <div class="transaction-name">
                                        <div class="txn-label-stack">${labelHTML}</div>
                                        ${timeStr}
                                    </div>
                                </div>
                                <div class="transaction-amount" style="color:${amountColor}; margin-left:auto;">${amountSign}${getCurrencySymbol()}${fmtNum(t.amount)}</div>
                            </div>
                        </div>`;
    });
  });

  container.innerHTML = `<div class="transactions-container">${html}</div>`;
  if (bulkMode) container.classList.add("bulk-mode");
  initSwipeListeners("transactions");
}

function handleRowTap(txnId, wrapperEl) {
  if (bulkMode) toggleRowSelection(txnId, wrapperEl);
}

// ── Analysis ──────────────────────────────────────────────────
function changeAnalysisView() {
  const selectedView = document.getElementById("analysisTypeSelector").value;
  document
    .querySelectorAll(".analysis-view")
    .forEach((v) => (v.style.display = "none"));
  document.getElementById(selectedView + "-view").style.display = "block";
  switch (selectedView) {
    case "expense-overview":
      renderExpenseChart();
      break;
    case "income-overview":
      renderIncomeChart();
      break;
  }
}

function updateAnalysis() {
  updateAnalysisMonthDisplay();
  const analysisSection = document.getElementById("analysis-section");
  if (analysisSection && analysisSection.classList.contains("active"))
    changeAnalysisView();
}

let incomeChartInstance = null;

function getAnalysisMonthTransactions() {
  const year = currentAnalysisMonth.getFullYear(),
    month = currentAnalysisMonth.getMonth();
  return transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function renderExpenseChart() {
  const monthTxns = getAnalysisMonthTransactions();
  const catExp = {};
  monthTxns.forEach((t) => {
    if (t.type === "expense")
      catExp[t.category] = (catExp[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catExp),
    data = Object.values(catExp);
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#FF9FF3",
    "#54A0FF",
    "#5F27CD",
    "#01CBC6",
  ];
  const ctx = document.getElementById("expenseChart");
  if (chartInstance) chartInstance.destroy();

  if (labels.length === 0) {
    const legendEl = document.getElementById("expenseLegend");
    if (legendEl) legendEl.innerHTML = "";
    document.getElementById("expenseBreakdown").innerHTML =
      '<div class="empty-state"><i class="fa-solid fa-chart-pie" style="font-size:48px;opacity:0.35;"></i><p>No expenses yet</p></div>';
  } else {
    chartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors.slice(0, labels.length) }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 0 },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
      },
    });
    renderChartLegend(labels, colors, "expenseLegend");
    renderBreakdown(catExp, colors, "expense");
  }
  // FIX: Removed stray renderIncomeChart() call — income renders only when explicitly selected
}

function renderIncomeChart() {
  const monthTxns = getAnalysisMonthTransactions();
  const catInc = {};
  monthTxns.forEach((t) => {
    if (t.type === "income")
      catInc[t.category] = (catInc[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catInc),
    data = Object.values(catInc);
  const colors = [
    "#4caf50",
    "#81C784",
    "#A5D6A7",
    "#2E7D32",
    "#66BB6A",
    "#C8E6C9",
    "#1B5E20",
    "#69F0AE",
    "#00E676",
    "#B9F6CA",
    "#43A047",
    "#388E3C",
  ];
  const ctx = document.getElementById("incomeChart");
  if (incomeChartInstance) incomeChartInstance.destroy();

  if (labels.length === 0) {
    const legendEl = document.getElementById("incomeLegend");
    if (legendEl) legendEl.innerHTML = "";
    document.getElementById("incomeBreakdown").innerHTML =
      '<div class="empty-state"><i class="fa-solid fa-arrow-trend-up" style="font-size:48px;opacity:0.35;"></i><p>No income recorded yet</p></div>';
    return;
  }

  incomeChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, labels.length) }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
    },
  });
  renderChartLegend(labels, colors, "incomeLegend");
  renderBreakdown(catInc, colors, "income");
}

// Renders a 2-column legend below the pie chart
function renderChartLegend(labels, colors, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = labels
    .map(
      (label, i) =>
        `<div class="chart-legend-item">
      <span class="chart-legend-dot" style="background:${colors[i % colors.length]};"></span>
      <span class="chart-legend-label">${label}</span>
    </div>`,
    )
    .join("");
}

function renderBreakdown(categoryData, colors, type, customContainerId) {
  const total = Object.values(categoryData).reduce((a, b) => a + b, 0) || 1;
  const colorArray =
    type === "income"
      ? [
          "#4caf50",
          "#81C784",
          "#A5D6A7",
          "#2E7D32",
          "#66BB6A",
          "#C8E6C9",
          "#1B5E20",
          "#69F0AE",
          "#00E676",
          "#B9F6CA",
          "#43A047",
          "#388E3C",
        ]
      : [
          "#FF6B6B",
          "#4ECDC4",
          "#45B7D1",
          "#FFA07A",
          "#98D8C8",
          "#F7DC6F",
          "#BB8FCE",
          "#85C1E2",
          "#FF9FF3",
          "#54A0FF",
          "#5F27CD",
          "#01CBC6",
        ];
  const catList = type === "income" ? incomeCategories : expenseCategories;
  const containerId =
    customContainerId ||
    (type === "income" ? "incomeBreakdown" : "expenseBreakdown");
  const sign = type === "income" ? "+" : "-";
  let html = "";

  Object.entries(categoryData).forEach(([category, amount], index) => {
    const pct = ((amount / total) * 100).toFixed(2);
    const icon =
      catList.find((c) => c.name === category)?.icon ||
      (type === "income" ? "💵" : "💰");
    const color = colorArray[index % colorArray.length];
    html += `
                    <div class="breakdown-item">
                        <div class="breakdown-info">
                            <div class="breakdown-icon" style="background:${color}80;">${icon}</div>
                            <div class="breakdown-details"><h4>${category}</h4><div class="breakdown-percentage">${pct}%</div></div>
                        </div>
                        <div style="flex:0 0 150px;">
                            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color};"></div></div>
                            <div class="breakdown-amount" style="color:${type === "income" ? "var(--income)" : "var(--gold)"};">${sign}${getCurrencySymbol()}${fmtNum(amount)}</div>
                        </div>
                    </div>`;
  });
  document.getElementById(containerId).innerHTML =
    html ||
    `<div class="empty-state"><i class="fa-solid fa-chart-bar" style="font-size:48px;opacity:0.35;"></i><p>No ${type} data yet</p></div>`;
}

let expenseCategoryChartInstance = null,
  incomeCategoryChartInstance = null,
  accountChartInstance = null;

function renderExpenseCategoryChart() {
  // FIXED: guard — canvas/container IDs don't exist in current HTML; bail silently to prevent null crash
  const ctx = document.getElementById("expenseCategoryChart");
  if (!ctx) return;
  const monthTxns = getAnalysisMonthTransactions();
  const catExp = {};
  monthTxns.forEach((t) => {
    if (t.type === "expense")
      catExp[t.category] = (catExp[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catExp),
    data = Object.values(catExp);
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#FF9FF3",
    "#54A0FF",
    "#5F27CD",
    "#01CBC6",
  ];
  if (expenseCategoryChartInstance) expenseCategoryChartInstance.destroy();

  if (labels.length === 0) {
    const bd = document.getElementById("expenseCategoryBreakdown");
    if (bd)
      bd.innerHTML =
        '<div class="empty-state"><i class="fa-solid fa-chart-pie" style="font-size:48px;opacity:0.35;"></i><p>No expenses yet</p></div>';
    return;
  }

  const isLightExp = document.body.classList.contains("light-mode");
  expenseCategoryChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Expense Amount",
          data,
          backgroundColor: colors.slice(0, labels.length),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: isLightExp ? "#1a1a3a" : "#e0e0e0" },
          grid: { color: isLightExp ? "#ccc" : "#444" },
        },
        x: {
          ticks: { color: isLightExp ? "#1a1a3a" : "#e0e0e0" },
          grid: { display: false },
        },
      },
    },
  });
  renderBreakdown(catExp, colors, "expense", "expenseCategoryBreakdown");
}

function renderIncomeCategoryChart() {
  // FIXED: guard — canvas/container IDs don't exist in current HTML; bail silently
  const ctx = document.getElementById("incomeCategoryChart");
  if (!ctx) return;
  const monthTxns = getAnalysisMonthTransactions();
  const catInc = {};
  monthTxns.forEach((t) => {
    if (t.type === "income")
      catInc[t.category] = (catInc[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(catInc),
    data = Object.values(catInc);
  const colors = [
    "#4caf50",
    "#81C784",
    "#A5D6A7",
    "#2E7D32",
    "#66BB6A",
    "#C8E6C9",
    "#1B5E20",
    "#69F0AE",
    "#00E676",
    "#B9F6CA",
    "#43A047",
    "#388E3C",
  ];
  if (incomeCategoryChartInstance) incomeCategoryChartInstance.destroy();

  if (labels.length === 0) {
    const bd = document.getElementById("incomeCategoryBreakdown");
    if (bd)
      bd.innerHTML =
        '<div class="empty-state"><i class="fa-solid fa-arrow-trend-up" style="font-size:48px;opacity:0.35;"></i><p>No income recorded yet</p></div>';
    return;
  }

  const isLightInc = document.body.classList.contains("light-mode");
  incomeCategoryChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Income Amount",
          data,
          backgroundColor: colors.slice(0, labels.length),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: isLightInc ? "#1a1a3a" : "#e0e0e0" },
          grid: { color: isLightInc ? "#ccc" : "#444" },
        },
        x: {
          ticks: { color: isLightInc ? "#1a1a3a" : "#e0e0e0" },
          grid: { display: false },
        },
      },
    },
  });
  renderBreakdown(catInc, colors, "income", "incomeCategoryBreakdown");
}

function renderAccountChart() {
  // FIXED: guard — canvas/container IDs don't exist in current HTML; bail silently
  const ctx = document.getElementById("accountChart");
  if (!ctx) return;
  const accountBalances = {};
  accounts.forEach((acc) => {
    accountBalances[acc.name] = acc.balance;
  });
  const labels = Object.keys(accountBalances),
    data = Object.values(accountBalances);
  const colors = [
    "#d4af37",
    "#FFD700",
    "#FFC947",
    "#FFB900",
    "#FFAA00",
    "#FF9500",
    "#FF8000",
    "#FFA500",
    "#FFB347",
    "#FFCC5C",
  ];
  if (accountChartInstance) {
    accountChartInstance.destroy();
    accountChartInstance = null;
  }
  if (labels.length === 0) {
    const bd = document.getElementById("accountBreakdown");
    if (bd)
      bd.innerHTML =
        '<div class="empty-state"><i class="fa-solid fa-building-columns" style="font-size:48px;opacity:0.35;"></i><p>No accounts yet</p></div>';
    return;
  }

  const isLightAcc = document.body.classList.contains("light-mode");
  accountChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, labels.length) }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "right",
          labels: { color: isLightAcc ? "#1a1a3a" : "#e0e0e0", padding: 15 },
        },
      },
    },
  });

  // FIX: Use Math.abs for percentage denominator so negative balances don't skew percentages
  const total = data.reduce((a, b) => a + Math.abs(b), 0) || 1;
  let html = "";
  labels.forEach((label, i) => {
    const amount = accountBalances[label];
    const pct = ((Math.abs(amount) / total) * 100).toFixed(1);
    const account = accounts.find((a) => a.name === label);
    const color = colors[i % colors.length];
    html += `
                    <div class="breakdown-item">
                        <div class="breakdown-info">
                            <!-- UPDATED: PNG icon in account breakdown -->
                            <div class="breakdown-icon" style="background:${color}40;color:${color};">${renderAccountIconImg(account?.icon || "", "acct-png-icon")}</div>
                            <div class="breakdown-details"><h4>${label}</h4><div class="breakdown-percentage">${pct}% of total</div></div>
                        </div>
                        <div style="flex:0 0 150px;">
                            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color};"></div></div>
                            <div class="breakdown-amount" style="color:${amount >= 0 ? "var(--gold)" : "var(--expense)"};">${getCurrencySymbol()}${fmtNum(amount)}</div>
                        </div>
                    </div>`;
  });
  document.getElementById("accountBreakdown").innerHTML = html;
}

// ── Budgets ───────────────────────────────────────────────────
function updateBudgets() {
  const budgetNavEl = document.getElementById("currentBudgetMonthNav");
  if (budgetNavEl)
    budgetNavEl.textContent = currentBudgetMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: PH_TZ,
    }); // FIX BUG 2

  const year = currentBudgetMonth.getFullYear(); // FIX BUG 2
  const mon = String(currentBudgetMonth.getMonth() + 1).padStart(2, "0"); // FIX BUG 2
  const month = `${year}-${mon}`;
  const monthBudgets = budgets.filter((b) => b.month === month);
  let totalBudget = 0,
    totalSpent = 0,
    html = "";

  monthBudgets.forEach((budget) => {
    const spent = transactions
      .filter(
        (t) =>
          t.type === "expense" &&
          t.category === budget.category &&
          t.date.slice(0, 7) === month,
      )
      .reduce((s, t) => s + t.amount, 0);
    const remaining = budget.limit - spent;
    const percentage = (spent / budget.limit) * 100;
    const icon =
      expenseCategories.find((c) => c.name === budget.category)?.icon || "💰";
    totalBudget += budget.limit;
    totalSpent += spent;
    html += `
                    <div class="budget-item">
                        <div class="budget-header">
                            <div class="budget-title-info">
                                <div class="budget-icon" style="background:rgba(212,175,55,0.2);color:#d4af37;">${icon}</div>
                                <div><div class="budget-name">${budget.category}</div></div>
                            </div>
                            <div class="budget-menu">
                                    <!-- CHANGED: FA icons replace ✎/✕ text in budget menu buttons -->
                                    <button onclick="openBudgetModal(${budget.id})" aria-label="Edit budget" title="Edit"><i class="fa-solid fa-pen"></i></button>
                                    <button onclick="deleteBudget(${budget.id})"    aria-label="Delete budget" title="Delete"><i class="fa-solid fa-trash"></i></button>
                                </div>
                        </div>
                        <div class="budget-stats">
                            <div class="budget-stat"><div class="budget-stat-label">Limit</div><div class="budget-stat-value">${getCurrencySymbol()}${fmtNum(budget.limit)}</div></div>
                            <div class="budget-stat"><div class="budget-stat-label">Spent</div><div class="budget-stat-value">${getCurrencySymbol()}${fmtNum(spent)}</div></div>
                            <div class="budget-stat"><div class="budget-stat-label">Remaining</div><div class="budget-stat-value" style="color:${remaining >= 0 ? "var(--income)" : "var(--expense)"};">${getCurrencySymbol()}${fmtNum(remaining)}</div></div>
                        </div>
                        <div class="budget-progress"><div class="budget-progress-bar"><div class="budget-progress-fill" style="width:${Math.min(percentage, 100)}%"></div></div></div>
                    </div>`;
  });

  document.getElementById("totalBudget").textContent = fmtNum(totalBudget);
  document.getElementById("totalBudgetSpent").textContent = fmtNum(totalSpent);
  document.getElementById("budgetsContainer").innerHTML =
    html ||
    '<div class="empty-state"><i class="fa-solid fa-sack-xmark" style="font-size:48px;opacity:0.35;"></i><p>No budgets for this month</p></div>';
}

// ── Accounts ──────────────────────────────────────────────────
let accountSortMode = "default"; // 'default' | 'az' | 'za'

function toggleAccountSort() {
  if (accountSortMode === "default") accountSortMode = "az";
  else if (accountSortMode === "az") accountSortMode = "za";
  else accountSortMode = "default";
  const btn = document.getElementById("accountSortBtn");
  const icon = document.getElementById("accountSortIcon");
  const label = document.getElementById("accountSortLabel");
  // CHANGED: FA icons replace text arrows in sort button
  if (accountSortMode === "az") {
    icon.innerHTML = '<i class="fa-solid fa-arrow-up-a-z"></i>';
    label.textContent = "Sort: A–Z";
    if (btn) {
      btn.style.borderColor = "var(--gold)";
      btn.style.color = "var(--gold)";
    }
  } else if (accountSortMode === "za") {
    icon.innerHTML = '<i class="fa-solid fa-arrow-down-z-a"></i>';
    label.textContent = "Sort: Z–A";
    if (btn) {
      btn.style.borderColor = "var(--gold)";
      btn.style.color = "var(--gold)";
    }
  } else {
    icon.innerHTML = '<i class="fa-solid fa-arrow-up-arrow-down"></i>';
    label.textContent = "Sort: Default";
    if (btn) {
      btn.style.borderColor = "var(--glass-border)";
      btn.style.color = "var(--text-secondary)";
    }
  }
  updateAccounts();
}

function updateAccounts() {
  // FIX: Recompute balances here too so summary stats are always accurate
  updateAccountBalances();
  let totalBalance = 0,
    totalIncome = 0,
    totalExpense = 0;
  accounts.forEach((acc) => {
    totalBalance += acc.balance;
  });
  transactions.forEach((t) => {
    if (t.type === "income") totalIncome += t.amount;
    if (t.type === "expense") totalExpense += t.amount;
  });
  document.getElementById("accountsTotal").textContent = fmtNum(totalBalance);
  document.getElementById("accountsIncome").textContent = fmtNum(totalIncome);
  document.getElementById("accountsExpense").textContent = fmtNum(totalExpense);

  // Apply sort
  let displayAccounts = [...accounts];
  if (accountSortMode === "az")
    displayAccounts.sort((a, b) => a.name.localeCompare(b.name));
  else if (accountSortMode === "za")
    displayAccounts.sort((a, b) => b.name.localeCompare(a.name));

  let html = "";
  displayAccounts.forEach((account) => {
    // FIX: colour balance red when negative, use CSS variables for theme compatibility
    const balanceColor =
      account.balance >= 0 ? "var(--income)" : "var(--expense)";
    html += `
                    <div class="account-swipe-wrapper" data-id="${account.id}" style="margin-bottom:8px;">
                        <div class="swipe-actions">
                                <!-- CHANGED: FA icons replace text icons in account swipe actions -->
                                <button class="swipe-edit-btn"   aria-label="Edit"   title="Edit"   onclick="openAccountModal(${account.id})"><span class="btn-icon"><i class="fa-solid fa-pen"></i></span></button>
                                <button class="swipe-delete-btn" aria-label="Delete" title="Delete" onclick="event.stopPropagation(); deleteAccount(${account.id})"><span class="btn-icon"><i class="fa-solid fa-trash"></i></span></button>
                            </div>
                        <div class="swipe-content account-card" style="border-radius:8px;cursor:pointer;" onclick="openTxnDetailForAccount(${account.id})"><!-- UPDATED: open detail modal -->
                            <div class="account-left">
                                <!-- UPDATED: PNG icon in account card -->
                                <div class="account-icon">${renderAccountIconImg(account.icon, "acct-png-icon")}</div>
                                <div class="account-info">
                                    <div class="account-name">${account.name}</div>
                                    <div class="account-balance"><span class="acct-bal-label">Balance: </span><span class="acct-bal-amount" style="color:${balanceColor};">${getCurrencySymbol()}${fmtNum(account.balance)}</span></div>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-left" style="color:var(--gold);font-size:13px;flex-shrink:0;"></i>
                        </div>
                    </div>`;
  });
  document.getElementById("accountsContainer").innerHTML = html;
  initSwipeListeners("accounts");
}

// ── Categories ────────────────────────────────────────────────
function updateCategories() {
  let html = '<div class="categories-grid">';
  html +=
    '<h3 class="category-section-title">Income Categories</h3><div class="categories-list">';
  incomeCategories.forEach((cat) => {
    html += `
                    <div class="category-swipe-wrapper" data-id="${cat.id}" data-type="income">
                        <div class="swipe-actions">
                                <!-- CHANGED: FA icons replace text icons in income category swipe actions -->
                                <button class="swipe-edit-btn"   aria-label="Edit"   title="Edit"   onclick="openCategoryModal('income', ${cat.id})"><span class="btn-icon"><i class="fa-solid fa-pen"></i></span></button>
                                <button class="swipe-delete-btn" aria-label="Delete" title="Delete" onclick="deleteCategory(${cat.id}, 'income')"><span class="btn-icon"><i class="fa-solid fa-trash"></i></span></button>
                            </div>
                            <div class="swipe-content category-row" style="border-radius:8px;cursor:pointer;" data-cat-name="${cat.name}" data-cat-icon="${cat.icon}" onclick="openTxnDetailForCategory(this.dataset.catName, this.dataset.catIcon)"><!-- UPDATED: open detail modal -->
                                <div class="category-left">
                                    <div class="category-circle" style="background:rgba(76,175,80,0.2);color:#4caf50;">${cat.icon}</div>
                                    <div class="category-info"><div class="category-name">${cat.name}</div></div>
                                </div>
                                <i class="fa-solid fa-chevron-left" style="color:var(--gold);font-size:13px;flex-shrink:0;"></i>
                        </div>
                    </div>`;
  });
  html +=
    '</div><button class="add-btn-outline" onclick="openCategoryModal(\'income\')" style="margin-top:10px;">+ Add Income Category</button>';
  html +=
    '<h3 class="category-section-title">Expense Categories</h3><div class="categories-list">';
  expenseCategories.forEach((cat) => {
    html += `
                    <div class="category-swipe-wrapper" data-id="${cat.id}" data-type="expense">
                        <div class="swipe-actions">
                                <!-- CHANGED: FA icons replace text icons in expense category swipe actions -->
                                <button class="swipe-edit-btn"   aria-label="Edit"   title="Edit"   onclick="openCategoryModal('expense', ${cat.id})"><span class="btn-icon"><i class="fa-solid fa-pen"></i></span></button>
                                <button class="swipe-delete-btn" aria-label="Delete" title="Delete" onclick="deleteCategory(${cat.id}, 'expense')"><span class="btn-icon"><i class="fa-solid fa-trash"></i></span></button>
                            </div>
                            <div class="swipe-content category-row" style="border-radius:8px;cursor:pointer;" data-cat-name="${cat.name}" data-cat-icon="${cat.icon}" onclick="openTxnDetailForCategory(this.dataset.catName, this.dataset.catIcon)"><!-- UPDATED: open detail modal -->
                                <div class="category-left">
                                    <div class="category-circle" style="background:rgba(244,67,54,0.2);color:#f44336;">${cat.icon}</div>
                                    <div class="category-info"><div class="category-name">${cat.name}</div></div>
                                </div>
                                <i class="fa-solid fa-chevron-left" style="color:var(--gold);font-size:13px;flex-shrink:0;"></i>
                        </div>
                    </div>`;
  });
  html +=
    '</div><button class="add-btn-outline" onclick="openCategoryModal(\'expense\')" style="margin-top:10px;">+ Add Expense Category</button>';
  html += "</div>";
  document.getElementById("categoriesContainer").innerHTML = html;
  initSwipeListeners("categories");
}

// ── Reset Form ────────────────────────────────────────────────
function resetForm() {
  calcExpression = "0";
  const calcDisplay = document.getElementById("modalCalcDisplay");
  if (calcDisplay) calcDisplay.textContent = "0";
  document.getElementById("txnNotes").value = "";
  // Set today's date and current time
  document.getElementById("txnDate").value = todayPHString();
  setCurrentTime();
  // Reset selectors — UPDATED: restore placeholder style via helper
  _resetSelectedItem("txnAccountText", "Select Account");
  _resetSelectedItem("txnCategoryText", "Select Category");
  _resetSelectedItem("transferFromText", "Select Account");
  _resetSelectedItem("transferToText", "Select Account");
  document
    .getElementById("txnAccountDisplay")
    .removeAttribute("data-account-id");
  document
    .getElementById("txnCategoryDisplay")
    .removeAttribute("data-category-id");
  document
    .getElementById("transferFromDisplay")
    .removeAttribute("data-account-id");
  document
    .getElementById("transferToDisplay")
    .removeAttribute("data-account-id");
  // FIX: Always restore inputModal interactivity in case selector left it locked
  const inputModal = document.getElementById("inputModal");
  if (inputModal) {
    inputModal.style.opacity = "1";
    inputModal.style.pointerEvents = "auto";
  }
  // FIX: Also ensure accountSelectorModal is closed
  const selectorModal = document.getElementById("accountSelectorModal");
  if (selectorModal) selectorModal.classList.remove("active");
  const modalBody = document.querySelector("#inputModal .modal-body");
  if (modalBody) modalBody.scrollTop = 0;
}

// ── Persistence ───────────────────────────────────────────────
function saveData() {
  localStorage.setItem("transactions", JSON.stringify(transactions));
  localStorage.setItem("accounts", JSON.stringify(accounts));
  localStorage.setItem("incomeCategories", JSON.stringify(incomeCategories));
  localStorage.setItem("expenseCategories", JSON.stringify(expenseCategories));
  localStorage.setItem("budgets", JSON.stringify(budgets));
}

// ── Delete Confirmation Modal ─────────────────────────────────
let _deleteCallback = null;

function showDeleteModal(icon, title, desc, onConfirm) {
  _deleteCallback = onConfirm;
  document.getElementById("deleteModalIcon").textContent = icon;
  document.getElementById("deleteModalTitle").textContent = title;
  document.getElementById("deleteModalDesc").innerHTML = desc;
  document.getElementById("deleteConfirmModal").style.display = "block";
  preventBodyScroll();
}

function closeDeleteModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("deleteConfirmModal").style.display = "none";
  _deleteCallback = null;
  allowBodyScroll();
}

function executeDelete() {
  document.getElementById("deleteConfirmModal").style.display = "none";
  if (_deleteCallback) {
    _deleteCallback();
    _deleteCallback = null;
  }
  allowBodyScroll();
}

// ── Validation Modal ──────────────────────────────────────────
function showValidationModal(fields) {
  const list = document.getElementById("validationModalList");
  list.innerHTML = fields
    .map(
      (f) =>
        `<div class="validation-field-item">
                    <span class="validation-field-bullet"><i class="fa-solid fa-triangle-exclamation"></i></span>
                    <span class="validation-field-text">${f}</span>
                </div>`,
    )
    .join("");
  document.getElementById("validationModal").style.display = "block";
  preventBodyScroll();
}

function closeValidationModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("validationModal").style.display = "none";
  document.getElementById("validationModalTitle").textContent =
    "Please fill in the following";
  allowBodyScroll();
}

function resetAllData() {
  openResetModal();
}

// ── Reset / Danger Modal ──────────────────────────────────────
function openResetModal() {
  document.getElementById("resetConfirmInput").value = "";
  document.getElementById("resetConfirmBtn").disabled = true;
  document.getElementById("resetModal").style.display = "block";
  preventBodyScroll();
  setTimeout(() => document.getElementById("resetConfirmInput").focus(), 100);
}

function closeResetModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("resetModal").style.display = "none";
  allowBodyScroll();
}

function checkResetInput() {
  document.getElementById("resetConfirmBtn").disabled =
    document.getElementById("resetConfirmInput").value !== "DELETE";
}

function executeReset() {
  // FIX: Snapshot categories BEFORE clearing localStorage so custom categories survive reset
  const savedIncome = JSON.parse(JSON.stringify(incomeCategories));
  const savedExpense = JSON.parse(JSON.stringify(expenseCategories));

  transactions = [];
  budgets = [];
  // UPDATED: default account icons on reset — use local PNG filenames
  accounts = [
    { id: 1, name: "Card", initialBalance: 0, balance: 0, icon: "Debit.png" },
    { id: 2, name: "Cash", initialBalance: 0, balance: 0, icon: "Cash.png" },
  ];
  incomeCategories = savedIncome;
  expenseCategories = savedExpense;

  // FIXED: preserve UI preferences (theme, dark mode, currency, onboarding) across reset
  var _keepColorMode = localStorage.getItem("colorMode");
  var _keepTheme = localStorage.getItem("appTheme");
  var _keepCurrency = localStorage.getItem("currency");
  var _keepOnboarding = localStorage.getItem("onboardingDone");
  localStorage.clear();
  if (_keepColorMode) localStorage.setItem("colorMode", _keepColorMode);
  if (_keepTheme) localStorage.setItem("appTheme", _keepTheme);
  if (_keepCurrency) localStorage.setItem("currency", _keepCurrency);
  if (_keepOnboarding) localStorage.setItem("onboardingDone", _keepOnboarding);
  saveData();
  updateUI();
  document.getElementById("resetModal").style.display = "none";
  allowBodyScroll(); // FIX: restore scroll after reset modal closes
  showNotification('<i class="fa-solid fa-trash-can"></i>', "Data Reset", [
    "All records, budgets and account balances have been cleared.",
  ]);
}

// ── Bulk Delete ───────────────────────────────────────────────
function toggleBulkMode() {
  if (bulkMode) exitBulkMode();
  else enterBulkMode();
}

function enterBulkMode() {
  bulkMode = true;
  selectedTxnIds.clear();
  document.getElementById("transactionsContainer").classList.add("bulk-mode");
  document.getElementById("bulkSelectBar").classList.add("active");
  const btn = document.getElementById("bulkToggleBtn");
  // UPDATED: theme-based colors — read CSS variable so it follows active theme
  const themeAccent = getComputedStyle(document.body)
    .getPropertyValue("--gold")
    .trim();
  btn.style.borderColor = themeAccent || "var(--gold)";
  btn.style.color = themeAccent || "var(--gold)";
  btn.classList.add("bulk-active");
  updateBulkBar();
}

function exitBulkMode() {
  bulkMode = false;
  selectedTxnIds.clear();
  document
    .getElementById("transactionsContainer")
    .classList.remove("bulk-mode");
  document.getElementById("bulkSelectBar").classList.remove("active");
  document
    .querySelectorAll(".swipe-wrapper.row-selected")
    .forEach((w) => w.classList.remove("row-selected"));
  const btn = document.getElementById("bulkToggleBtn");
  // UPDATED: theme-based colors — clear inline styles, fall back to CSS class
  btn.style.borderColor = "";
  btn.style.color = "";
  btn.classList.remove("bulk-active");
}

function toggleRowSelection(txnId, wrapperEl) {
  if (!bulkMode) return;
  if (selectedTxnIds.has(txnId)) {
    selectedTxnIds.delete(txnId);
    wrapperEl.classList.remove("row-selected");
  } else {
    selectedTxnIds.add(txnId);
    wrapperEl.classList.add("row-selected");
  }
  updateBulkBar();
}

function bulkSelectAll() {
  const wrappers = document.querySelectorAll(
    "#transactionsContainer .swipe-wrapper[data-id]",
  );
  const allSelected =
    wrappers.length > 0 &&
    [...wrappers].every((w) => w.classList.contains("row-selected"));
  // FIXED: use Number() not parseInt — imported IDs can be floats (Date.now()+Math.random())
  if (allSelected) {
    wrappers.forEach((w) => {
      w.classList.remove("row-selected");
      selectedTxnIds.delete(Number(w.dataset.id));
    });
  } else {
    wrappers.forEach((w) => {
      w.classList.add("row-selected");
      selectedTxnIds.add(Number(w.dataset.id));
    });
  }
  updateBulkBar();
}

function updateBulkBar() {
  const count = selectedTxnIds.size;
  document.getElementById("bulkSelectCount").textContent = `${count} selected`;
  document.getElementById("bulkDeleteBtn").disabled = count === 0;
}

function confirmBulkDelete() {
  const count = selectedTxnIds.size;
  if (count === 0) return;
  showDeleteModal(
    "",
    `Delete ${count} Transaction${count > 1 ? "s" : ""}?`,
    `You are about to permanently delete <strong>${count} selected transaction${count > 1 ? "s" : ""}</strong>.<br>This cannot be undone.`,
    () => {
      transactions = transactions.filter((t) => !selectedTxnIds.has(t.id));
      selectedTxnIds.clear();
      saveData();
      updateUI();
      exitBulkMode();
      showNotification('<i class="fa-solid fa-trash-can"></i>', "Deleted", [
        `${count} transaction(s) removed`,
      ]);
    },
  );
}

// ── Search ────────────────────────────────────────────────────
function openSearchModal() {
  // FIXED: debounce rapid clicks to prevent UI freezes
  if (openSearchModalDebounce) return;
  openSearchModalDebounce = true;
  setTimeout(() => {
    openSearchModalDebounce = false;
  }, 400);

  document.getElementById("searchModal").classList.add("active");
  preventBodyScroll();
  document.getElementById("searchInput").value = "";
  document.getElementById("searchTypeFilter").value = "all";
  document.getElementById("searchDateFrom").value = "";
  document.getElementById("searchDateTo").value = "";
  document.getElementById("searchResults").innerHTML =
    '<div class="empty-state"><i class="fa-solid fa-magnifying-glass" style="font-size:48px;opacity:0.35;"></i><p>Enter search criteria above</p></div>';

  // FIXED: Immediate focus for faster response
  const searchInput = document.getElementById("searchInput");
  searchInput.focus();

  // FIXED: Scroll input into view when keyboard appears on mobile
  setTimeout(() => {
    searchInput.scrollIntoView({ behavior: "smooth", block: "nearest" });
    searchInput.focus(); // Re-focus to ensure keyboard stays open
  }, 300);
}

function closeSearchModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("searchModal").classList.remove("active");
  allowBodyScroll();
}

function performSearch() {
  const searchText = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  const typeFilter = document.getElementById("searchTypeFilter").value;
  const dateFrom = document.getElementById("searchDateFrom").value;
  const dateTo = document.getElementById("searchDateTo").value;
  let results = [...transactions];

  if (searchText) {
    results = results.filter((txn) => {
      const amount = txn.amount.toString();
      const cat = txn.category ? txn.category.toLowerCase() : "";
      const notes = txn.notes ? txn.notes.toLowerCase() : "";
      let accName = "";
      if (txn.type === "transfer") {
        const from = accounts.find((a) => a.id === txn.from),
          to = accounts.find((a) => a.id === txn.to);
        accName = `${from?.name || ""} ${to?.name || ""}`.toLowerCase();
      } else {
        const acc = accounts.find((a) => a.id === txn.accountId);
        accName = acc ? acc.name.toLowerCase() : "";
      }
      return (
        amount.includes(searchText) ||
        cat.includes(searchText) ||
        notes.includes(searchText) ||
        accName.includes(searchText)
      );
    });
  }
  if (typeFilter !== "all")
    results = results.filter((txn) => txn.type === typeFilter);
  if (dateFrom)
    results = results.filter((txn) => txn.date.split("T")[0] >= dateFrom);
  if (dateTo)
    results = results.filter((txn) => txn.date.split("T")[0] <= dateTo);
  results.sort((a, b) => new Date(b.date) - new Date(a.date));
  displaySearchResults(results);
}

function displaySearchResults(results) {
  const container = document.getElementById("searchResults");
  if (results.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><i class="fa-solid fa-receipt" style="font-size:48px;opacity:0.35;"></i><p>No transactions found</p><span class="empty-hint">Try a different word or clear the filters</span></div>';
    return;
  }

  // FIX: Use CSS variables instead of hardcoded dark-mode hex colours
  let html = `<div class="search-count">${results.length} ${results.length === 1 ? "result" : "results"}</div><div class="search-list">`;

  results.forEach((txn) => {
    const date = new Date(txn.date);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: PH_TZ,
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: PH_TZ,
    });
    let icon, typeText, detailText, amountClass, iconBgClass; // FIXED: added iconBgClass for circle background

    if (txn.type === "transfer") {
      // UPDATED: replaced arrow with category icon (transfer keeps directional icon as no category applies)
      icon = '<i class="fa-solid fa-right-left" aria-label="Transfer"></i>';
      typeText = "Transfer";
      amountClass = "amount-balance";
      iconBgClass = "icon-transfer";
      const from = accounts.find((a) => a.id === txn.from),
        to = accounts.find((a) => a.id === txn.to);
      detailText = `${from?.name || "Unknown"} → ${to?.name || "Unknown"}`;
    } else if (txn.type === "income") {
      // UPDATED: replaced arrow-down with category icon from existing incomeCategories mapping
      const catObj = [...incomeCategories, ...expenseCategories].find(
        (c) => c.name === txn.category,
      );
      icon = `<span aria-label="${txn.category}">${catObj ? catObj.icon : "💰"}</span>`;
      typeText = txn.category;
      amountClass = "amount-income";
      iconBgClass = "icon-income";
      detailText =
        accounts.find((a) => a.id === txn.accountId)?.name || "Unknown";
    } else {
      // UPDATED: replaced arrow-up with category icon from existing expenseCategories mapping
      const catObj = [...incomeCategories, ...expenseCategories].find(
        (c) => c.name === txn.category,
      );
      icon = `<span aria-label="${txn.category}">${catObj ? catObj.icon : "💰"}</span>`;
      typeText = txn.category;
      amountClass = "amount-expense";
      iconBgClass = "icon-expense";
      detailText =
        accounts.find((a) => a.id === txn.accountId)?.name || "Unknown";
    }

    html += `
                    <div class="transaction-item" onclick="editTransaction(${txn.id}); closeSearchModal();">
                        <div class="transaction-icon ${iconBgClass}">${icon}</div>
                        <div class="transaction-info">
                            <div class="transaction-title">${typeText}</div>
                            <div class="transaction-subtitle">${detailText}</div>
                            ${txn.notes ? `<div class="transaction-notes">${txn.notes}</div>` : ""}
                        </div>
                        <div class="transaction-right">
                            <div class="transaction-amount ${amountClass}">${txn.type === "expense" ? "-" : txn.type === "income" ? "+" : ""}${getCurrencySymbol()}${fmtNum(txn.amount)}</div>
                            <div class="transaction-date">${dateStr}</div>
                        </div>
                    </div>`;
  });
  container.innerHTML = html + "</div>";
}

// ── FAB hide-on-scroll ────────────────────────────────────────
// FIX M4: scrolling happens on .main-container, not window — window.scrollY is always 0
let lastScrollY = 0;
let _fab = null;
window.addEventListener("DOMContentLoaded", () => {
  _fab = document.querySelector(".fab");
  const _mainContainer = document.querySelector(".main-container");
  if (_mainContainer) {
    _mainContainer.addEventListener(
      "scroll",
      () => {
        if (!_fab) _fab = document.querySelector(".fab");
        if (!_fab) return;
        const currentScrollY = _mainContainer.scrollTop;
        if (currentScrollY > lastScrollY && currentScrollY > 80)
          _fab.classList.add("hide");
        else _fab.classList.remove("hide");
        lastScrollY = currentScrollY;
      },
      { passive: true },
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// ── THEMES ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
const THEME_NAMES = {
  gold: "Gold (default)",
  ocean: "Ocean Blue",
  sakura: "Sakura Pink",
  forest: "Forest Green",
  midnight: "Midnight Purple",
};

// Per-theme: app title shown in header & sidebar, plus logo gradient colors
const THEME_META = {
  gold: {
    title: "Kashi Tracker",
    grad1: "#d4af37",
    grad2: "#f0d060",
    gradLight1: "#9a6e00",
    gradLight2: "#c49000",
  },
  ocean: {
    title: "Kashi Tracker",
    grad1: "#29b6f6",
    grad2: "#80d8ff",
    gradLight1: "#0277bd",
    gradLight2: "#039be5",
  },
  sakura: {
    title: "Kashi Tracker",
    grad1: "#f48fb1",
    grad2: "#fce4ec",
    gradLight1: "#c2185b",
    gradLight2: "#e91e63",
  },
  forest: {
    title: "Kashi Tracker",
    grad1: "#66bb6a",
    grad2: "#b9f6ca",
    gradLight1: "#2e7d32",
    gradLight2: "#43a047",
  },
  midnight: {
    title: "Kashi Tracker",
    grad1: "#b39ddb",
    grad2: "#ede7f6",
    gradLight1: "#512da8",
    gradLight2: "#7e57c2",
  },
};

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("appTheme", theme);

  const isLight = document.body.classList.contains("light-mode");
  const meta = THEME_META[theme] || THEME_META.gold;

  // Sync all swatch sets (sidebar + preferences)
  document.querySelectorAll(".theme-swatch, .sidebar-swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.theme === theme);
  });

  // Update theme name label in preferences
  const label = document.getElementById("themeNameLabel");
  if (label) label.textContent = THEME_NAMES[theme] || theme;

  // Update header logo gradient & title text
  const g1 = isLight ? meta.gradLight1 : meta.grad1;
  const g2 = isLight ? meta.gradLight2 : meta.grad2;
  const headerLogo = document.querySelector(".logo-text");
  if (headerLogo) {
    headerLogo.textContent = meta.title;
    headerLogo.style.background = `linear-gradient(135deg, ${g1}, ${g2})`;
    headerLogo.style.webkitBackgroundClip = "text";
    headerLogo.style.webkitTextFillColor = "transparent";
    headerLogo.style.backgroundClip = "text";
  }

  // Update sidebar logo title
  const sidebarLogo = document.getElementById("sidebarLogoText");
  if (sidebarLogo) {
    sidebarLogo.textContent = meta.title;
    sidebarLogo.style.background = `linear-gradient(135deg, ${g1}, ${g2})`;
    sidebarLogo.style.webkitBackgroundClip = "text";
    sidebarLogo.style.webkitTextFillColor = "transparent";
    sidebarLogo.style.backgroundClip = "text";
  }

  // Re-render charts so accent color updates immediately
  const analysisSection = document.getElementById("analysis-section");
  if (analysisSection && analysisSection.classList.contains("active")) {
    setTimeout(() => changeAnalysisView(), 50);
  }

  // UPDATED — sync Help & Feedback modal border/shadow to current theme accent
  const accentColor = isLight ? meta.gradLight1 : meta.grad1;
  const modalStyle =
    "border-color:" +
    accentColor +
    "60;box-shadow:0 8px 40px " +
    accentColor +
    "26;max-width:340px;";
  const helpBox = document.getElementById("helpModalBox");
  const feedbackBox = document.getElementById("feedbackModalBox");
  if (helpBox) helpBox.setAttribute("style", modalStyle);
  if (feedbackBox) feedbackBox.setAttribute("style", modalStyle);
}

function initTheme() {
  const saved = localStorage.getItem("appTheme") || "gold";
  applyTheme(saved);
}

// ═══════════════════════════════════════════════════════════════
// ── MULTI-CURRENCY ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
const CURRENCIES = [
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "KRW", symbol: "₩", name: "Korean Won" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
];

// FIXED: wrap in try/catch — corrupt localStorage JSON would throw and blank the entire app
let currentCurrency;
try {
  currentCurrency =
    JSON.parse(localStorage.getItem("currency")) || CURRENCIES[0];
} catch (e) {
  currentCurrency = CURRENCIES[0];
  localStorage.removeItem("currency");
}

function getCurrencySymbol() {
  return currentCurrency.symbol;
}

// Format a number with thousands commas and 2 decimal places e.g. 1,234,567.89
function fmtNum(num) {
  const abs = Math.abs(num);
  const parts = abs.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (num < 0 ? "-" : "") + parts.join(".");
}

function openCurrencyModal() {
  const list = document.getElementById("currencyList");
  list.innerHTML = CURRENCIES.map(
    (c) => `
                <div onclick="selectCurrency('${c.code}')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--glass-border);border-radius:8px;transition:background 0.15s;${c.code === currentCurrency.code ? "background:var(--gold-glow,rgba(212,175,55,0.12));" : ""}"
                    onmouseover="this.style.background='var(--glass)'" onmouseout="this.style.background='${c.code === currentCurrency.code ? "var(--gold-glow,rgba(212,175,55,0.12))" : "transparent"}'">
                    <span style="font-size:20px;width:32px;text-align:center;font-weight:700;color:var(--gold);">${c.symbol}</span>
                    <div>
                        <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${c.name}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${c.code}</div>
                    </div>
                    ${c.code === currentCurrency.code ? '<span style="margin-left:auto;color:var(--gold);font-size:16px;" aria-label="selected"><i class="fa-solid fa-check"></i></span>' : ""}
                </div>`,
  ).join("");
  document.getElementById("currencyModal").style.display = "block";
  preventBodyScroll();
}

function selectCurrency(code) {
  const found = CURRENCIES.find((c) => c.code === code);
  if (!found) return;
  currentCurrency = found;
  localStorage.setItem("currency", JSON.stringify(found));
  updateCurrencyUI();
  closeCurrencyModal();
  showNotification(
    '<i class="fa-solid fa-arrow-right-arrow-left"></i>',
    "Currency Updated",
    [`${found.symbol} ${found.name} (${found.code})`],
  );
}

function updateCurrencyUI() {
  updateCurrencyPrefixes();
  updateUI();
}

function closeCurrencyModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("currencyModal").style.display = "none";
  allowBodyScroll();
}

// Patch formatAmount globally — all rendering uses this
function fmtAmt(amount) {
  return `${getCurrencySymbol()}${fmtNum(Math.abs(amount))}`;
}

// ═══════════════════════════════════════════════════════════════
// ── ONBOARDING ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
function initOnboarding() {
  const done = localStorage.getItem("onboardingDone");
  if (!done) {
    document.getElementById("onboardingOverlay").classList.remove("hidden");
  }
}

function obNext(step) {
  document
    .querySelectorAll(".ob-step")
    .forEach((s) => s.classList.remove("active"));
  const el = document.getElementById("ob-step-" + step);
  if (el) el.classList.add("active");
}

function obBack(step) {
  obNext(step);
}

function skipOnboarding() {
  finishOnboarding();
}
function finishOnboarding() {
  localStorage.setItem("onboardingDone", "1");
  document.getElementById("onboardingOverlay").classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════════
// ── INIT HOOK  (runs after original DOMContentLoaded) ─────────
// ═══════════════════════════════════════════════════════════════

// UPDATED: open transactions detail modal for a specific account
function openTxnDetailForAccount(accountId) {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc) return;
  _detailContext = { type: "account", accountId };
  const related = transactions
    .filter(
      (t) =>
        t.accountId === accountId || t.from === accountId || t.to === accountId,
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const iconHTML = acc.icon?.toLowerCase().endsWith(".png")
    ? `<img src="images/${acc.icon}" style="width:18px;height:18px;object-fit:cover;border-radius:5px;vertical-align:middle;margin-right:6px;" onerror="this.style.display='none'">`
    : `<span style="margin-right:5px;font-size:15px;">${acc.icon || "🏦"}</span>`;
  document.getElementById("txnDetailTitle").innerHTML =
    `Transactions for: ${iconHTML}${acc.name}`;
  document.getElementById("txnDetailBody").innerHTML =
    _renderDetailItems(related);
  document.getElementById("txnDetailModal").style.display = "block";
  preventBodyScroll();
  initSwipeListeners("detail");
}

// UPDATED: open transactions detail modal for a specific category
function openTxnDetailForCategory(categoryName, categoryIcon) {
  _detailContext = { type: "category", categoryName, categoryIcon };
  const related = transactions
    .filter((t) => t.category === categoryName)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById("txnDetailTitle").innerHTML =
    `<span style="margin-right:5px;">${categoryIcon}</span>${categoryName}`;
  document.getElementById("txnDetailBody").innerHTML =
    _renderDetailItems(related);
  document.getElementById("txnDetailModal").style.display = "block";
  preventBodyScroll();
  initSwipeListeners("detail");
}

// ── Editable History Helpers ──────────────────────────────────
// Refresh the open detail modal after an edit/delete
function _refreshDetailModal() {
  if (!_detailContext) return;
  if (_detailContext.type === "account") {
    const acc = accounts.find((a) => a.id === _detailContext.accountId);
    if (!acc) {
      // Account was deleted — close the modal
      document.getElementById("txnDetailModal").style.display = "none";
      allowBodyScroll();
      _detailContext = null;
      return;
    }
    const related = transactions
      .filter(
        (t) =>
          t.accountId === _detailContext.accountId ||
          t.from === _detailContext.accountId ||
          t.to === _detailContext.accountId,
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    document.getElementById("txnDetailBody").innerHTML =
      _renderDetailItems(related);
    initSwipeListeners("detail");
  } else if (_detailContext.type === "category") {
    const related = transactions
      .filter((t) => t.category === _detailContext.categoryName)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    document.getElementById("txnDetailBody").innerHTML =
      _renderDetailItems(related);
    initSwipeListeners("detail");
  }
}

// Edit a transaction from within the detail modal — close modal, open edit form
function editTxnFromDetail(id) {
  document.getElementById("txnDetailModal").style.display = "none";
  allowBodyScroll();
  editTransaction(id);
}

// Delete a transaction from within the detail modal — refresh list after deletion
function deleteTxnFromDetail(id) {
  const txn = transactions.find((t) => t.id === id);
  if (!txn) return;
  let desc = "";
  if (txn.type === "transfer") {
    const from = accounts.find((a) => a.id === txn.from);
    const to = accounts.find((a) => a.id === txn.to);
    desc = `<strong>Transfer</strong> — ${getCurrencySymbol()}${fmtNum(txn.amount)}<br>${from?.name || "Unknown"} → ${to?.name || "Unknown"}`;
  } else {
    const acc = accounts.find((a) => a.id === txn.accountId);
    const type = txn.type === "income" ? "Income" : "Expense";
    desc = `<strong>${type}</strong> — ${getCurrencySymbol()}${fmtNum(txn.amount)}<br>${txn.category} · ${acc?.name || "Unknown"}`;
  }
  showDeleteModal("", "Delete Transaction?", desc, () => {
    transactions = transactions.filter((t) => t.id !== id);
    saveData();
    updateUI();
    _refreshDetailModal();
    showNotification(
      '<i class="fa-solid fa-circle-check"></i>',
      "Transaction Deleted",
      ["Successfully removed from records"],
    );
  });
}

// UPDATED: close transactions detail modal
function closeTxnDetailModal(event) {
  // FIXED: allow click-outside to close
  if (event && event.target !== event.currentTarget) return;
  document.getElementById("txnDetailModal").style.display = "none";
  allowBodyScroll();
  _detailContext = null;
}

// UPDATED: group by month, date right-aligned on its own column
function _renderDetailItems(txns) {
  if (!txns.length)
    return '<div class="txn-detail-empty">No transactions found.</div>';
  const sym = getCurrencySymbol();

  // Group transactions by "Month Year" key
  const groups = {};
  const groupOrder = [];
  txns.forEach((t) => {
    const d = t.date ? new Date(t.date) : null;
    const key = d
      ? d.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: PH_TZ,
        })
      : "Unknown";
    if (!groups[key]) {
      groups[key] = [];
      groupOrder.push(key);
    }
    groups[key].push(t);
  });

  let html = "";
  groupOrder.forEach((key) => {
    // Month header
    html += `<div class="txn-detail-month-header">${key}</div>`;

    groups[key].forEach((t) => {
      const d = t.date ? new Date(t.date) : null;
      // Day + weekday only (month is already in the header)
      const dayStr = d
        ? d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: PH_TZ,
          })
        : "";
      const timeStr =
        d && t.date && t.date.includes("T")
          ? d.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZone: PH_TZ,
            })
          : "";

      let iconContent, iconBg, amtColor, amtSign, subLine;
      if (t.type === "transfer") {
        const fromName = accounts.find((a) => a.id === t.from)?.name || "?";
        const toName = accounts.find((a) => a.id === t.to)?.name || "?";
        iconContent = '<i class="fa-solid fa-right-left"></i>';
        iconBg = "background:rgba(212,175,55,0.15);color:var(--gold);";
        amtColor = "var(--gold)";
        amtSign = "";
        subLine = `${fromName} → ${toName}`;
      } else {
        const allCats = [...incomeCategories, ...expenseCategories];
        const catObj = allCats.find((c) => c.name === t.category);
        iconContent = catObj ? catObj.icon : "💰";
        iconBg =
          t.type === "income"
            ? "background:rgba(76,175,80,0.15);color:var(--income);"
            : "background:rgba(244,67,54,0.15);color:var(--expense);";
        amtColor = t.type === "income" ? "var(--income)" : "var(--expense)";
        amtSign = t.type === "income" ? "+" : "-";
        const accName = accounts.find((a) => a.id === t.accountId)?.name || "";
        // FIXED: sanitize notes in detail view
        const _safeNotes = t.notes
          ? t.notes
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
          : "";
        subLine = accName
          ? `${accName}${_safeNotes ? " · " + _safeNotes : ""}`
          : _safeNotes || "";
      }

      html += `
                        <div class="detail-swipe-wrapper" data-id="${t.id}" style="margin-bottom:8px;">
                          <div class="swipe-actions">
                            <button class="swipe-edit-btn" aria-label="Edit" title="Edit" onclick="event.stopPropagation(); editTxnFromDetail(${t.id})"><span class="btn-icon"><i class="fa-solid fa-pen"></i></span></button>
                            <button class="swipe-delete-btn" aria-label="Delete" title="Delete" onclick="event.stopPropagation(); deleteTxnFromDetail(${t.id})"><span class="btn-icon"><i class="fa-solid fa-trash"></i></span></button>
                          </div>
                          <div class="swipe-content txn-detail-item" style="margin-bottom:0;border-radius:12px;">
                            <div class="txn-detail-icon" style="${iconBg}">${iconContent}</div>
                            <div class="txn-detail-info">
                                <div class="txn-detail-cat">${t.type === "transfer" ? "Transfer" : t.category}</div>
                                ${subLine ? `<div class="txn-detail-sub">${subLine}</div>` : ""}
                            </div>
                            <div class="txn-detail-right">
                                <div class="txn-detail-amt" style="color:${amtColor}">${amtSign}${sym}${fmtNum(t.amount)}</div>
                                <div class="txn-detail-date">${dayStr}</div>
                                ${timeStr ? `<div class="txn-detail-time">${timeStr}</div>` : ""}
                            </div>
                          </div>
                        </div>`;
    });
  });
  return html;
}

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  // Load saved currency
  const savedCurrency = localStorage.getItem("currency");
  if (savedCurrency) {
    try {
      currentCurrency = JSON.parse(savedCurrency);
    } catch (e) {}
  }
  updateCurrencyPrefixes();
  // Check onboarding (slight delay so main UI loads first)
  setTimeout(initOnboarding, 300);
});

// Update the static ₱ prefix spans in the HTML stat tiles
function updateCurrencyPrefixes() {
  const sym = getCurrencySymbol();
  [
    "pfx-totalBudget",
    "pfx-totalBudgetSpent",
    "pfx-accountsTotal",
    "pfx-accountsExpense",
    "pfx-accountsIncome",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = sym;
  });
  // Update sidebar currency button
  const btn = document.getElementById("sidebarCurrencyBtn");
  if (btn)
    btn.textContent = `${currentCurrency.symbol} ${currentCurrency.code}`;
  // Update the currency description label in preferences
  const desc = document.getElementById("currentCurrencyDesc");
  if (desc)
    desc.textContent = `${currentCurrency.name} (${currentCurrency.symbol})`;
}
