/* CALCORA — Smart Scientific Calculator
   Safe expression parser: no eval() or dynamic code execution. */
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const expressionEl = $("#expression");
  const resultEl = $("#result");
  const errorEl = $("#errorMessage");
  const historyList = $("#historyList");
  const historyCount = $("#historyCount");
  const toast = $("#toast");

  const HISTORY_KEY = "calcora-history-v1";
  const THEME_KEY = "calcora-theme-v1";
  let expression = "";
  let lastResult = null;
  let justCalculated = false;
  let angleMode = "DEG";
  let history = loadHistory();
  let toastTimer;

  const operators = ["+", "−", "×", "÷", "^"];

  function loadHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter(item =>
        item && typeof item.expression === "string" &&
        typeof item.result === "string" && typeof item.id === "string"
      ).slice(0, 50) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {
      showToast("Could not save history in this browser.");
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function setError(message = "") {
    errorEl.textContent = message;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) throw new Error("Result is outside the supported number range.");
    if (Object.is(value, -0)) value = 0;
    const rounded = Number(value.toPrecision(12));
    return String(rounded);
  }

  function displayExpression(value) {
    expressionEl.textContent = value || "\u00a0";
  }

  function updateDisplay(preview = true) {
    displayExpression(expression);
    if (!expression) {
      resultEl.textContent = "0";
      return;
    }
    if (!preview) return;
    try {
      const value = evaluateExpression(expression);
      resultEl.textContent = formatNumber(value);
    } catch {
      resultEl.textContent = justCalculated && lastResult !== null ? formatNumber(lastResult) : "—";
    }
  }

  function tokenize(input) {
    const source = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const rest = source.slice(i);
      const numberMatch = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
      if (numberMatch) {
        const value = Number(numberMatch[0]);
        if (!Number.isFinite(value)) throw new Error("Please enter a valid number.");
        tokens.push({ type: "number", value });
        i += numberMatch[0].length;
        continue;
      }
      const identifier = rest.match(/^[a-zA-Z]+/);
      if (identifier) {
        const name = identifier[0].toLowerCase();
        if (name === "pi") tokens.push({ type: "number", value: Math.PI });
        else if (name === "e") tokens.push({ type: "number", value: Math.E });
        else if (["sin", "cos", "tan", "log", "ln", "sqrt"].includes(name)) tokens.push({ type: "function", value: name });
        else throw new Error("Unknown function or constant.");
        i += identifier[0].length;
        continue;
      }
      const char = source[i];
      if ("+-*/^()%!".includes(char)) {
        tokens.push({ type: "symbol", value: char });
        i++;
        continue;
      }
      throw new Error("Invalid character in expression.");
    }
    return tokens;
  }

  // Pratt parser handles precedence and right-associative powers.
  function evaluateExpression(input) {
    const tokens = tokenize(input);
    if (!tokens.length) throw new Error("Enter a calculation first.");
    let position = 0;
    const peek = () => tokens[position];
    const take = () => tokens[position++];

    function parseExpression(minBinding = 0) {
      let token = take();
      if (!token) throw new Error("Incomplete expression.");

      let left;
      if (token.type === "number") {
        left = token.value;
      } else if (token.type === "function") {
        const next = peek();
        let argument;
        if (next && next.value === "(") {
          take();
          argument = parseExpression(0);
          if (!peek() || take().value !== ")") throw new Error("Missing closing parenthesis.");
        } else {
          argument = parseExpression(25);
        }
        left = applyFunction(token.value, argument);
      } else if (token.value === "(") {
        left = parseExpression(0);
        if (!peek() || take().value !== ")") throw new Error("Missing closing parenthesis.");
      } else if (token.value === "+" || token.value === "-") {
        const operand = parseExpression(25);
        left = token.value === "-" ? -operand : operand;
      } else {
        throw new Error("Unexpected operator.");
      }

      while (peek()) {
        const next = peek();
        if (next.value === "!") {
          if (30 < minBinding) break;
          take();
          left = factorial(left);
          continue;
        }
        if (next.value === "%") {
          if (30 < minBinding) break;
          take();
          left /= 100;
          continue;
        }
        const binding = bindingPower(next.value);
        if (!binding || binding.left < minBinding) break;
        take();
        const right = parseExpression(binding.right);
        left = applyBinary(next.value, left, right);
      }
      if (!Number.isFinite(left)) throw new Error("Result is outside the supported number range.");
      return left;
    }

    const value = parseExpression(0);
    if (position < tokens.length) throw new Error("Please check the expression.");
    return value;
  }

  function bindingPower(operator) {
    switch (operator) {
      case "+": case "-": return { left: 10, right: 11 };
      case "*": case "/": return { left: 20, right: 21 };
      case "^": return { left: 30, right: 30 };
      default: return null;
    }
  }

  function applyBinary(operator, a, b) {
    switch (operator) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/":
        if (b === 0) throw new Error("Division by zero is not allowed.");
        return a / b;
      case "^": return Math.pow(a, b);
      default: throw new Error("Unsupported operation.");
    }
  }

  function applyFunction(name, value) {
    switch (name) {
      case "sin": return Math.sin(angleMode === "DEG" ? value * Math.PI / 180 : value);
      case "cos": return Math.cos(angleMode === "DEG" ? value * Math.PI / 180 : value);
      case "tan": {
        const radians = angleMode === "DEG" ? value * Math.PI / 180 : value;
        if (Math.abs(Math.cos(radians)) < 1e-12) throw new Error("Tangent is undefined at this angle.");
        return Math.tan(radians);
      }
      case "log":
        if (value <= 0) throw new Error("Logarithm requires a number greater than zero.");
        return Math.log10(value);
      case "ln":
        if (value <= 0) throw new Error("Natural logarithm requires a number greater than zero.");
        return Math.log(value);
      case "sqrt":
        if (value < 0) throw new Error("Square root of a negative number is not a real result.");
        return Math.sqrt(value);
      default: throw new Error("Unsupported scientific function.");
    }
  }

  function factorial(value) {
    if (!Number.isInteger(value) || value < 0 || value > 170) {
      throw new Error("Factorial requires a whole number from 0 to 170.");
    }
    let answer = 1;
    for (let n = 2; n <= value; n++) answer *= n;
    return answer;
  }

  function appendValue(value) {
    setError("");
    if (justCalculated && (/\d|\./.test(value) || value === "(")) expression = "";
    justCalculated = false;
    if (value === ".") {
      const current = expression.split(/[+\−×÷()^]/).pop();
      if (current.includes(".")) return;
      if (!current || operators.includes(expression.slice(-1))) value = "0.";
    }
    expression += value;
    updateDisplay();
  }

  function appendOperator(operator) {
    setError("");
    if (!expression) {
      if (operator === "−") { expression = "−"; updateDisplay(); }
      return;
    }
    justCalculated = false;
    const last = expression.slice(-1);
    if (operators.includes(last)) {
      if (operator === "−" && last !== "−") expression += operator;
      else expression = expression.slice(0, -1) + operator;
    } else if (last === "(" && operator !== "−") {
      return;
    } else {
      expression += operator;
    }
    updateDisplay();
  }

  function calculate() {
    setError("");
    if (!expression.trim()) {
      setError("Enter a calculation first.");
      return;
    }
    try {
      const value = evaluateExpression(expression);
      const formatted = formatNumber(value);
      addHistory(expression, formatted);
      lastResult = value;
      expressionEl.textContent = expression;
      expression = formatted;
      resultEl.textContent = formatted;
      justCalculated = true;
      setError("");
    } catch (error) {
      setError(error.message || "Unable to calculate this expression.");
      resultEl.textContent = "—";
      justCalculated = false;
    }
  }

  function addHistory(expr, result) {
    history.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, expression: expr, result, time: Date.now() });
    history = history.slice(0, 50);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyCount.textContent = `${history.length} ${history.length === 1 ? "calculation" : "calculations"}`;
    if (!history.length) {
      historyList.innerHTML = '<div class="empty-history"><span class="empty-icon">↺</span><strong>No calculations yet</strong><p>Your recent calculations will appear here.</p></div>';
      return;
    }
    historyList.replaceChildren();
    history.forEach(item => {
      const article = document.createElement("article");
      article.className = "history-item";
      const expr = document.createElement("div");
      expr.className = "history-expression";
      expr.textContent = item.expression;
      const row = document.createElement("div");
      row.className = "history-result-row";
      const result = document.createElement("strong");
      result.className = "history-result";
      result.textContent = `= ${item.result}`;
      const actions = document.createElement("div");
      actions.className = "history-actions";
      const reuse = document.createElement("button");
      reuse.className = "history-action";
      reuse.type = "button";
      reuse.title = "Reuse result";
      reuse.setAttribute("aria-label", "Reuse this result");
      reuse.textContent = "↶";
      reuse.addEventListener("click", () => {
        expression = item.result;
        justCalculated = false;
        setError("");
        updateDisplay();
        showToast("Result added to calculator.");
      });
      const remove = document.createElement("button");
      remove.className = "history-action";
      remove.type = "button";
      remove.title = "Delete calculation";
      remove.setAttribute("aria-label", "Delete this calculation");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        history = history.filter(entry => entry.id !== item.id);
        saveHistory();
        renderHistory();
      });
      actions.append(reuse, remove);
      row.append(result, actions);
      article.append(expr, row);
      historyList.append(article);
    });
  }

  function insertFunction(name) {
    setError("");
    const map = { sqrt: "sqrt(", sin: "sin(", cos: "cos(", tan: "tan(", log: "log(", ln: "ln(" };
    if (justCalculated) justCalculated = false;
    expression += map[name];
    updateDisplay(false);
  }

  function applyUnary(action) {
    setError("");
    if (!expression) {
      setError("Enter a number first.");
      return;
    }
    try {
      const current = evaluateExpression(expression);
      let result;
      switch (action) {
        case "square": result = current ** 2; break;
        case "reciprocal":
          if (current === 0) throw new Error("Cannot divide by zero.");
          result = 1 / current; break;
        case "factorial": result = factorial(current); break;
        case "percent": result = current / 100; break;
        case "sign": result = -current; break;
        default: return;
      }
      expression = formatNumber(result);
      lastResult = result;
      justCalculated = false;
      updateDisplay(false);
      resultEl.textContent = formatNumber(result);
    } catch (error) {
      setError(error.message);
    }
  }

  function handleAction(button) {
    const action = button.dataset.action;
    const value = button.dataset.value;
    if (action === "number") appendValue(value);
    else if (action === "decimal") appendValue(".");
    else if (action === "operator") appendOperator(value);
    else if (action === "clear") {
      expression = ""; lastResult = null; justCalculated = false; setError(""); updateDisplay();
    } else if (action === "delete") {
      expression = expression.slice(0, -1); justCalculated = false; setError(""); updateDisplay();
    } else if (action === "equals") calculate();
    else if (action === "function") insertFunction(value);
    else if (action === "constant") appendValue(value === "pi" ? "pi" : "e");
    else if (action === "parenthesis") appendValue(value);
    else if (action === "square" || action === "reciprocal" || action === "factorial" || action === "percent" || action === "sign") applyUnary(action);
    else if (action === "power") appendOperator("^");
  }

  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => handleAction(button));
  });

  document.querySelectorAll("[data-angle]").forEach(button => {
    button.addEventListener("click", () => {
      angleMode = button.dataset.angle;
      document.querySelectorAll("[data-angle]").forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      $("#displayMode").textContent = `${angleMode} MODE`;
      showToast(`Angle mode: ${angleMode}`);
      updateDisplay();
    });
  });

  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (/^\d$/.test(key)) { appendValue(key); event.preventDefault(); }
    else if (key === ".") { appendValue("."); event.preventDefault(); }
    else if (key === "+") { appendOperator("+"); event.preventDefault(); }
    else if (key === "-") { appendOperator("−"); event.preventDefault(); }
    else if (key === "*") { appendOperator("×"); event.preventDefault(); }
    else if (key === "/") { appendOperator("÷"); event.preventDefault(); }
    else if (key === "^") { appendOperator("^"); event.preventDefault(); }
    else if (key === "(" || key === ")") { appendValue(key); event.preventDefault(); }
    else if (key === "Enter" || key === "=") { calculate(); event.preventDefault(); }
    else if (key === "Backspace") { expression = expression.slice(0, -1); setError(""); updateDisplay(); event.preventDefault(); }
    else if (key === "Escape") { expression = ""; lastResult = null; justCalculated = false; setError(""); updateDisplay(); }
    else if (key === "%") { applyUnary("percent"); event.preventDefault(); }
  });

  function setTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Storage may be unavailable. */ }
    $("#themeToggle").setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  let savedTheme = "light";
  try { savedTheme = localStorage.getItem(THEME_KEY) || "light"; } catch { /* Use default theme. */ }
  setTheme(savedTheme === "dark" ? "dark" : "light");

  $("#themeToggle").addEventListener("click", () => {
    setTheme(document.body.classList.contains("dark") ? "light" : "dark");
  });

  const historyPanel = $("#historyPanel");
  const mainLayout = $(".main-layout");
  function toggleHistory(force) {
    const shouldHide = typeof force === "boolean" ? !force : !historyPanel.classList.contains("hidden");
    historyPanel.classList.toggle("hidden", shouldHide);
    mainLayout.classList.toggle("history-hidden", shouldHide);
  }
  $("#historyToggle").addEventListener("click", () => toggleHistory());
  $("#historyClose").addEventListener("click", () => toggleHistory(false));
  $("#clearHistory").addEventListener("click", () => {
    if (!history.length) { showToast("History is already empty."); return; }
    history = [];
    saveHistory();
    renderHistory();
    showToast("Calculation history cleared.");
  });
  $("#memoryClear").addEventListener("click", () => showToast("No stored calculator memory."));

  renderHistory();
  updateDisplay();
})();
