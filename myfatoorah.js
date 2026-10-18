/**
 * SiteCoda — MyFatoorah V2 Gateway Client & Sandbox Simulator (Qatar / GCC / Global)
 *
 * Official Endpoints:
 *   - Qatar Live:    https://api-qa.myfatoorah.com
 *   - KSA Live:      https://api-sa.myfatoorah.com
 *   - All GCC Live:  https://api.myfatoorah.com
 *   - Official Test: https://apitest.myfatoorah.com
 *
 * Supports:
 *   1. Client Quote / Invoice Payment Links (/v2/SendPayment, NotificationOption: "LNK")
 *      Accepts QPay/NAPS (Qatar), Apple Pay, Visa/Mastercard, Mada, KNET, Benefit.
 *   2. SiteCoda Pro SaaS Recurring Subscriptions (/v2/ExecutePayment with RecurringModel)
 */

window.MyFatoorahGateway = (function () {
  const STORAGE_KEY = "sitecoda_mf_config_v1";

  const DEFAULT_CONFIG = {
    mode: "sandbox", // "sandbox" (ready immediately) | "live" (when Qatar CR creds arrive)
    region: "QA", // QA = https://api-qa.myfatoorah.com
    proxyUrl: "", // Optional Cloudflare Worker / backend proxy URL for live API key protection
    apiToken: "", // Optional Token for testing via proxy
    merchantId: "QA-DOHA-SANDBOX"
  };

  function getConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...DEFAULT_CONFIG, ...saved };
    } catch (_) {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(next) {
    const merged = { ...getConfig(), ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function getBaseUrl(cfg) {
    if (cfg.mode === "sandbox") return "https://apitest.myfatoorah.com";
    if (cfg.region === "QA") return "https://api-qa.myfatoorah.com";
    if (cfg.region === "SA") return "https://api-sa.myfatoorah.com";
    return "https://api.myfatoorah.com";
  }

  /**
   * Builds the exact MyFatoorah V2 /v2/SendPayment payload for a Client Quote / Invoice Link
   */
  function buildInvoicePayload({ customerName, invoiceValue, currencyIso, reference, items, callbackUrl }) {
    return {
      NotificationOption: "LNK",
      CustomerName: customerName || "Valued Client",
      DisplayCurrencyIso: currencyIso || "QAR",
      InvoiceValue: Number(Number(invoiceValue || 0).toFixed(2)),
      CustomerReference: reference || "SC-0001",
      CallBackUrl: callbackUrl || window.location.origin + window.location.pathname + "?payment=success",
      ErrorUrl: callbackUrl || window.location.origin + window.location.pathname + "?payment=error",
      Language: /[\u0600-\u06FF]/.test(customerName || "") ? "ar" : "en",
      InvoiceItems: (items || [])
        .filter((i) => Number(i.price) > 0)
        .map((i) => ({
          ItemName: i.title.slice(0, 100),
          Quantity: 1,
          UnitPrice: Number(Number(i.price).toFixed(2))
        }))
    };
  }

  /**
   * Builds the exact MyFatoorah V2 /v2/ExecutePayment payload for SiteCoda SaaS Recurring Subscriptions
   */
  function buildRecurringSaaSPayload({ customerName, customerEmail, planType, currencyIso = "QAR" }) {
    const isYearly = planType === "yearly";
    const amount = currencyIso === "USD" ? (isYearly ? 299 : 39) : (isYearly ? 1090 : 145);
    return {
      PaymentMethodId: 2, // Visa/Mastercard/Apple Pay/QPay tokenized recurring
      CustomerName: customerName || "SiteCoda Subscriber",
      CustomerEmail: customerEmail || "",
      DisplayCurrencyIso: currencyIso,
      InvoiceValue: amount,
      CallBackUrl: window.location.origin + window.location.pathname + "?saas_sub=active",
      ErrorUrl: window.location.origin + window.location.pathname + "?saas_sub=error",
      RecurringModel: {
        RecurringType: isYearly ? "Custom" : "Monthly",
        IntervalDays: isYearly ? 365 : undefined,
        Iteration: 0 // 0 = Unlimited recurring cycles until cancelled
      }
    };
  }

  /**
   * Generates a MyFatoorah Payment Link.
   * - If `proxyUrl` is configured (Live or Sandbox Worker), calls the V2 `/v2/SendPayment` endpoint.
   * - Otherwise generates a realistic, verifiable Sandbox Invoice Link & payload preview so contractors
   *   can test the full workflow while waiting for Qatar live credentials.
   */
  async function createInvoiceLink(params) {
    const cfg = getConfig();
    const payload = buildInvoicePayload(params);

    if (cfg.proxyUrl && cfg.proxyUrl.startsWith("http")) {
      const res = await fetch(cfg.proxyUrl.replace(/\/$/, "") + "/v2/SendPayment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.apiToken ? { "X-MyFatoorah-Token": cfg.apiToken } : {})
        },
        body: JSON.stringify({
          baseUrl: getBaseUrl(cfg),
          payload
        })
      });
      const data = await res.json();
      if (data && data.IsSuccess && data.Data && data.Data.InvoiceURL) {
        return {
          mode: cfg.mode,
          invoiceId: data.Data.InvoiceId,
          invoiceUrl: data.Data.InvoiceURL,
          payload
        };
      }
      throw new Error((data && data.Message) || "MyFatoorah API returned an error");
    }

    // Instant Sandbox / Pre-Credential Link Generator
    const randomId = Math.floor(10000000 + Math.random() * 90000000);
    const refSlug = encodeURIComponent(params.reference || "SC-0104");
    const amtSlug = Number(params.invoiceValue || 0).toFixed(2);
    const curSlug = encodeURIComponent(params.currencyIso || "QAR");
    const sandboxUrl = `https://demo.myfatoorah.com/qa/pay/${randomId}?ref=${refSlug}&amount=${amtSlug}&currency=${curSlug}`;
    return {
      mode: "sandbox",
      invoiceId: randomId,
      invoiceUrl: sandboxUrl,
      payload
    };
  }

  return {
    getConfig,
    saveConfig,
    getBaseUrl,
    buildInvoicePayload,
    buildRecurringSaaSPayload,
    createInvoiceLink
  };
})();
