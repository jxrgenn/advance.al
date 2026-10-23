import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApiError, paymentsApi, PaymentOrderView } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, LayoutDashboard, Loader2, RefreshCw } from "lucide-react";

/**
 * /payment/success?order=<orderId>
 *
 * Stripe sends the customer here after checkout — but a redirect proves
 * nothing. We poll the real order status (the server also asks Stripe
 * directly if the webhook is late) and only say "paid" when the server says
 * so. States: verifying → paid | failed | not found | timeout (90 s), or
 * processing (a delayed payment method — the bank settles it later; the
 * job is published automatically when it does).
 */

const POLL_MS = 2000;
const TIMEOUT_MS = 90 * 1000;
const FINAL = new Set(["paid", "refunded", "partially_refunded", "disputed", "failed", "canceled", "expired"]);

type ViewState = "verifying" | "paid" | "processing" | "refunded" | "disputed" | "failed" | "notfound" | "timeout";

// L3: a refunded / disputed order must never be shown as "published".
function viewStateFor(status: string): ViewState {
  if (status === "failed" || status === "canceled" || status === "expired") return "failed";
  if (status === "refunded" || status === "partially_refunded") return "refunded";
  if (status === "disputed") return "disputed";
  return "paid";
}

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const [order, setOrder] = useState<PaymentOrderView | null>(null);
  const [state, setState] = useState<ViewState>(orderId ? "verifying" : "notfound");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const r = await paymentsApi.getOrder(orderId);
        if (cancelled) return;
        if (r.success && r.data) {
          setOrder(r.data);
          // 'paid' with activation still 'not_applied' = the job update is in
          // flight (milliseconds) — keep polling so we never claim "published"
          // for a job that is still pending_payment.
          const settled = FINAL.has(r.data.status) && !(r.data.status === "paid" && r.data.activation === "not_applied");
          if (settled) {
            setState(viewStateFor(r.data.status));
            return;
          }
          if (r.data.processing) {
            setState("processing");
            return;
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
          setState("notfound");
          return;
        }
        // transient (network / 5xx / 429) — keep polling until the timeout
      }
      if (Date.now() - startedAt.current >= TIMEOUT_MS) {
        setState("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  const retryPath = order
    ? `/payment/job/${order.jobId}${order.purpose === "job_renewal" ? "?purpose=job_renewal" : ""}`
    : "/employer-dashboard";

  const awaitingApproval = order?.jobStatus === "pending_approval";
  const activationSkipped = order?.activation === "skipped";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="Pagesa u krye" path="/payment/success" noindex />
      <Navigation />
      <main className="flex-1 container py-12">
        <div className="max-w-xl mx-auto">
          <Card className={`border-2 ${state === "paid" && !activationSkipped ? "border-green-200" : state === "verifying" ? "border-primary/20" : "border-amber-200"}`}>
            <CardContent className="pt-8 pb-6 text-center space-y-4" aria-live="polite">
              {state === "verifying" && (
                <>
                  <div className="bg-muted p-4 rounded-full inline-flex">
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  </div>
                  <h1 className="text-2xl font-bold">Po verifikojmë pagesën…</h1>
                  <p className="text-muted-foreground">
                    Kjo zakonisht zgjat disa sekonda. Mos e mbyllni këtë faqe.
                  </p>
                </>
              )}

              {state === "paid" && order && !activationSkipped && (
                <>
                  <div className="bg-green-100 p-4 rounded-full inline-flex">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Pagesa u krye me sukses!</h1>
                  <p className="text-muted-foreground">
                    {order.jobTitle ? <>Puna <strong>“{order.jobTitle}”</strong> </> : "Puna juaj "}
                    {awaitingApproval
                      ? "do të publikohet sapo të miratohet nga ekipi ynë."
                      : order.purpose === "job_renewal"
                        ? "u ripostua dhe është e dukshme për kandidatët për 21 ditë."
                        : "është publikuar dhe është tashmë e dukshme për kandidatët."}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Shuma: €{order.amountEur.toFixed(2)} · Porosia {order.orderId}. Fatura do t'ju vijë me email.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 pt-4">
                    <Button onClick={() => navigate("/employer-dashboard")} className="w-full">
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Te paneli
                    </Button>
                    {!awaitingApproval && order.jobSlug ? (
                      <Button onClick={() => navigate(`/jobs/${order.jobSlug}`)} variant="outline" className="w-full">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Shiko punën
                      </Button>
                    ) : null}
                  </div>
                </>
              )}

              {state === "paid" && order && activationSkipped && (
                <>
                  <div className="bg-amber-100 p-4 rounded-full inline-flex">
                    <AlertTriangle className="h-12 w-12 text-amber-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Pagesa u mor, por nuk u aplikua</h1>
                  <p className="text-muted-foreground">
                    Kjo punë ishte tashmë e paguar ose nuk është më e disponueshme. Ekipi ynë është njoftuar
                    dhe do t'jua rimbursojë shumën. Për pyetje: support@advance.al (porosia {order.orderId}).
                  </p>
                  <Button onClick={() => navigate("/employer-dashboard")} className="w-full sm:w-auto">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Te paneli
                  </Button>
                </>
              )}

              {state === "refunded" && order && (
                <>
                  <div className="bg-blue-100 p-4 rounded-full inline-flex">
                    <RefreshCw className="h-12 w-12 text-blue-600" />
                  </div>
                  <h1 className="text-2xl font-bold">
                    {order.status === "partially_refunded" ? "Pagesa u rimbursua pjesërisht" : "Pagesa u rimbursua"}
                  </h1>
                  <p className="text-muted-foreground">
                    {order.status === "partially_refunded"
                      ? "Një pjesë e shumës iu kthye kartës suaj."
                      : `Shuma €${order.amountEur.toFixed(2)} iu kthye kartës suaj dhe kjo pagesë nuk e publikon punën.`}{" "}
                    Për pyetje: support@advance.al (porosia {order.orderId}).
                  </p>
                  <Button onClick={() => navigate("/employer-dashboard")} className="w-full sm:w-auto">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Te paneli
                  </Button>
                </>
              )}

              {state === "disputed" && order && (
                <>
                  <div className="bg-amber-100 p-4 rounded-full inline-flex">
                    <AlertTriangle className="h-12 w-12 text-amber-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Pagesa është në kontestim</h1>
                  <p className="text-muted-foreground">
                    Banka juaj ka hapur një kontestim për këtë pagesë. Ekipi ynë do t'ju kontaktojë.
                    Për pyetje: support@advance.al (porosia {order.orderId}).
                  </p>
                  <Button onClick={() => navigate("/employer-dashboard")} className="w-full sm:w-auto">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Te paneli
                  </Button>
                </>
              )}

              {state === "failed" && (
                <>
                  <div className="bg-amber-100 p-4 rounded-full inline-flex">
                    <AlertTriangle className="h-12 w-12 text-amber-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Pagesa nuk u krye</h1>
                  <p className="text-muted-foreground">
                    {order?.status === "expired"
                      ? "Sesioni i pagesës skadoi para se të përfundonte."
                      : "Pagesa nuk u kompletua."}{" "}
                    Puna nuk është publikuar. Mund ta provoni përsëri.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 pt-2">
                    <Button onClick={() => navigate(retryPath)} className="w-full">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Provo përsëri
                    </Button>
                    <Button onClick={() => navigate("/employer-dashboard")} variant="outline" className="w-full">
                      Te paneli
                    </Button>
                  </div>
                </>
              )}

              {state === "processing" && (
                <>
                  <div className="bg-blue-100 p-4 rounded-full inline-flex">
                    <Clock className="h-12 w-12 text-blue-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Pagesa po përpunohet</h1>
                  <p className="text-muted-foreground">
                    Mënyra e pagesës që zgjodhët konfirmohet nga banka me vonesë.
                    {order?.jobTitle ? ` Puna "${order.jobTitle}"` : " Puna"} publikohet automatikisht
                    sapo pagesa të konfirmohet dhe fatura ju vjen me email. Nuk keni nevojë të paguani përsëri.
                  </p>
                  <Button onClick={() => navigate("/employer-dashboard")} className="w-full sm:w-auto">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Te paneli
                  </Button>
                </>
              )}

              {state === "timeout" && (
                <>
                  <div className="bg-blue-100 p-4 rounded-full inline-flex">
                    <Clock className="h-12 w-12 text-blue-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Konfirmimi po vonon</h1>
                  <p className="text-muted-foreground">
                    Nuk morëm ende konfirmimin e pagesës. Nëse pagesa u krye, puna publikohet automatikisht
                    sapo ta marrim dhe do t'ju vijë fatura me email. Nuk keni nevojë të paguani përsëri.
                  </p>
                  <Button onClick={() => navigate("/employer-dashboard")} className="w-full sm:w-auto">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Te paneli
                  </Button>
                </>
              )}

              {state === "notfound" && (
                <>
                  <div className="bg-muted p-4 rounded-full inline-flex">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h1 className="text-2xl font-bold">Nuk u gjet porosia</h1>
                  <p className="text-muted-foreground">
                    Nuk mund ta verifikojmë këtë pagesë nga kjo lidhje. Kontrolloni statusin e punës në panel.
                  </p>
                  <Button onClick={() => navigate("/employer-dashboard")} className="w-full sm:w-auto">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Te paneli
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentSuccess;
