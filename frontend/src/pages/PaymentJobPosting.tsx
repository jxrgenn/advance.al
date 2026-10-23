import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ApiError, jobsApi, paymentsApi, Job, CheckoutTier, PaymentPurpose } from "@/lib/api";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, CreditCard, Loader2, Lock, RefreshCw, Sparkles, Star } from "lucide-react";

/**
 * /payment/job/:jobId[?purpose=job_renewal]
 *
 * Tier picker + "Pay by card". Prices, card availability and whether this
 * employer posts free NOW come from GET /api/payments/options (per user — the
 * exact values checkout uses). The pay button creates a server-side order and
 * sends the browser to Stripe's hosted page; the job is published only after
 * the server confirms the payment. If the employer posts free now (whitelisted
 * or payments switched off after posting), a "Publiko tani" button publishes
 * the job without payment instead (M5a).
 */

type Prices = { standard: number; promoted: number };

const POST_STATES = ["pending_payment"];
const RENEWAL_STATES = ["expired", "closed"];

const formatEur = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;

const PaymentJobPosting = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [params] = useSearchParams();
  const purpose: PaymentPurpose = params.get("purpose") === "job_renewal" ? "job_renewal" : "job_post";
  const isRenewal = purpose === "job_renewal";
  const navigate = useNavigate();
  const { toast } = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [paymentsAvailable, setPaymentsAvailable] = useState<boolean>(true);
  const [selectedTier, setSelectedTier] = useState<CheckoutTier>("standard");
  const [paying, setPaying] = useState(false);
  const [free, setFree] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    if (!jobId) return null;
    const r = await jobsApi.getJob(jobId);
    if (r.success && r.data?.job) {
      setJob(r.data.job);
      return r.data.job;
    }
    return null;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      navigate("/employer-dashboard");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Both calls go through apiRequest: an expired token is refreshed and
        // retried transparently; if that fails we leave for the dashboard.
        const [loadedJob, options] = await Promise.all([
          loadJob(),
          paymentsApi.getOptions(jobId).catch(() => null),
        ]);
        if (cancelled) return;
        if (!loadedJob) {
          navigate("/employer-dashboard");
          return;
        }
        if (loadedJob.tier === "premium" || loadedJob.tier === "featured") setSelectedTier("promoted");
        if (options?.success && options.data) {
          setPrices(options.data.prices);
          setPaymentsAvailable(options.data.paymentsAvailable);
          setFree(options.data.free);
        }
      } catch {
        if (!cancelled) navigate("/employer-dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, navigate, loadJob]);

  const allowedStates = isRenewal ? RENEWAL_STATES : POST_STATES;
  const payable = !!job && allowedStates.includes(job.status);

  const renewForFree = async () => {
    if (!jobId) return;
    try {
      await jobsApi.renewJob(jobId);
      toast({ title: "Puna u ripostua", description: "Llogaria juaj riposton falas." });
      navigate("/employer-dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ripostimi dështoi.");
    }
  };

  const handlePublishFree = async () => {
    if (!jobId || publishing) return;
    setError(null);
    if (isRenewal) {
      setPublishing(true);
      await renewForFree();
      setPublishing(false);
      return;
    }
    setPublishing(true);
    try {
      await paymentsApi.publishFree(jobId);
      toast({ title: "Puna u publikua", description: "Llogaria juaj publikon falas — puna është tani e dukshme për kandidatët." });
      navigate("/employer-dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.response?.code === "PAYMENT_REQUIRED") {
        // No longer free (config changed back) — show the paid flow.
        setFree(false);
      }
      setError(err instanceof Error ? err.message : "Publikimi dështoi.");
    } finally {
      setPublishing(false);
    }
  };

  const handlePay = async () => {
    if (!jobId || paying) return;
    setError(null);
    setPaying(true);
    try {
      const r = await paymentsApi.createCheckout(jobId, selectedTier, purpose);
      if (r.success && r.data?.url) {
        // Leave the button disabled: the browser is navigating to the checkout.
        window.location.assign(r.data.url);
        return;
      }
      setError(r.message || "Nuk mund të hapet faqja e pagesës. Provoni përsëri.");
      setPaying(false);
    } catch (err) {
      setPaying(false);
      if (err instanceof ApiError) {
        const code = err.response?.code;
        if (code === "ALREADY_PAID") {
          toast({ title: "Kjo punë është paguar", description: "Pagesa sapo u konfirmua." });
          navigate("/employer-dashboard");
          return;
        }
        if (code === "FREE_POSTING") {
          // Became free since the page loaded — offer the free publish path.
          setFree(true);
          return;
        }
        if (code === "INVALID_JOB_STATE") {
          await loadJob();
        }
        if (code === "PAYMENTS_UNAVAILABLE") {
          setPaymentsAvailable(false);
        }
        setError(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Nuk mund të hapet faqja e pagesës.");
    }
  };

  const handleCancelPost = async () => {
    if (!jobId || cancelling) return;
    const ok = window.confirm("A jeni i sigurt që doni ta anuloni këtë postim? Puna nuk do të publikohet.");
    if (!ok) return;
    setCancelling(true);
    try {
      await jobsApi.deleteJob(jobId);
      toast({ title: "Postimi u anulua", description: "Mund të krijoni një postim të ri kur jeni gati." });
      navigate("/employer-dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.response?.code === "PAYMENT_COMPLETED") {
        toast({ title: "Pagesa u krye", description: "Puna sapo u publikua — nuk u anulua." });
        navigate("/employer-dashboard");
        return;
      }
      // 409 PAYMENT_PROCESSING / CHECKOUT_IN_PROGRESS carry the reason in Albanian.
      const description = err instanceof ApiError && err.status === 409 && err.message
        ? err.message
        : "Nuk mund të anulohet tani. Provoni përsëri.";
      toast({ title: "Gabim", description, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Pagesa e postimit" path="/payment/job" noindex />
        <Navigation />
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!job) return null;

  const price = prices ? (selectedTier === "promoted" ? prices.promoted : prices.standard) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="Pagesa e postimit" path="/payment/job" noindex />
      <Navigation />
      <main className="flex-1 container py-8">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/employer-dashboard")} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Kthehu te paneli
          </Button>

          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-full">
                  {isRenewal ? <RefreshCw className="h-6 w-6 text-primary" /> : <CreditCard className="h-6 w-6 text-primary" />}
                </div>
                <div>
                  <CardTitle className="text-2xl">
                    {isRenewal ? "Riposto punën" : free ? "Publiko punën" : "Zgjidh paketën dhe paguaj"}
                  </CardTitle>
                  <CardDescription>
                    {free
                      ? "Pa pagesë — puna publikohet për 21 ditë"
                      : isRenewal
                        ? "Puna publikohet sërish për 21 ditë pas konfirmimit të pagesës"
                        : "Puna publikohet menjëherë pas konfirmimit të pagesës"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Titulli i punës</p>
                <p className="font-semibold">{job.title}</p>
              </div>

              {!payable ? (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-amber-900">
                    {job.status === "active" || job.status === "pending_approval" ? (
                      <p>Kjo punë është tashmë e paguar{job.status === "pending_approval" ? " dhe pret miratimin" : " dhe e publikuar"}. Nuk nevojitet pagesë.</p>
                    ) : (
                      <p>
                        {isRenewal
                          ? "Vetëm punët e skaduara ose të mbyllura mund të ripostohen."
                          : "Kjo punë nuk është në pritje të pagesës."}
                      </p>
                    )}
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/employer-dashboard")}>
                      Te paneli
                    </Button>
                  </div>
                </div>
              ) : free ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-green-900">
                      Llogaria juaj publikon falas tani — nuk nevojitet pagesë.
                      {isRenewal ? " Puna ripostohet për 21 ditë." : " Puna publikohet menjëherë për 21 ditë."}
                    </p>
                  </div>
                  {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                      {error}
                    </div>
                  )}
                  <Button onClick={handlePublishFree} size="lg" className="w-full" disabled={publishing}>
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    {isRenewal ? "Riposto tani" : "Publiko tani"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TierCard
                      selected={selectedTier === "standard"}
                      onSelect={() => setSelectedTier("standard")}
                      title="Standart"
                      price={prices?.standard ?? null}
                      description="Postim i rregullt"
                      // Only what the code does (both tiers: same listing, search,
                      // stats, unlimited applications, job-alert emails).
                      features={["Aktiv për 21 ditë", "Në listën e punëve dhe në kërkim", "Aplikime të pakufizuara", "Njoftim me email për kandidatët që përputhen"]}
                      disabled={paying}
                    />
                    <TierCard
                      selected={selectedTier === "promoted"}
                      onSelect={() => setSelectedTier("promoted")}
                      title="I Promovuar"
                      price={prices?.promoted ?? null}
                      description="Dukshmëri më e madhe"
                      badge="I rekomanduar"
                      // Promoted = tier 'premium' → shown in the "Punë të Promovuara"
                      // carousel (home page + Punët; newest 10 promoted jobs).
                      features={["Gjithçka që përfshin Standarti", "Në karuselin “Punë të Promovuara” në faqen kryesore dhe te Punët", "Aktiv për 21 ditë"]}
                      disabled={paying}
                    />
                  </div>

                  {!paymentsAvailable && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" role="alert">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-amber-900">
                        Pagesat me kartë nuk janë aktive ende. Ju lutemi kontaktoni mbështetjen.
                      </p>
                    </div>
                  )}

                  <div className="flex items-start gap-3 text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-blue-800">
                      {isRenewal
                        ? "Puna mbetet e padukshme deri sa pagesa të kompletohet. Pas pagesës do të ridrejtoheni automatikisht."
                        : "Puna mbetet e ruajtur dhe e padukshme deri sa pagesa të kompletohet. Pas pagesës do të ridrejtoheni automatikisht."}
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button onClick={handlePay} size="lg" className="w-full" disabled={paying || !paymentsAvailable}>
                      {paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                      {price !== null ? `Paguaj me kartë ${formatEur(price)}` : "Paguaj me kartë"}
                    </Button>
                    {isRenewal ? (
                      <Button onClick={() => navigate("/employer-dashboard")} variant="outline" size="lg" className="w-full" disabled={paying}>
                        Jo tani
                      </Button>
                    ) : (
                      <Button onClick={handleCancelPost} variant="outline" size="lg" className="w-full" disabled={cancelling || paying}>
                        {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Anulo postimin
                      </Button>
                    )}
                  </div>

                  <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" />
                    Pagesa e sigurt me Stripe — të dhënat e kartës nuk kalojnë nga serverat tanë.
                  </p>
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

type TierCardProps = {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: number | null;
  description: string;
  features: string[];
  badge?: string;
  disabled?: boolean;
};

const TierCard = ({ selected, onSelect, title, price, description, features, badge, disabled }: TierCardProps) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={disabled}
    aria-pressed={selected}
    className={`relative text-left rounded-lg border-2 p-4 transition-all disabled:opacity-60 ${
      selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-muted hover:border-muted-foreground/30"
    }`}
  >
    {badge && (
      <span className="absolute -top-2 right-3 bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
        <Star className="h-3 w-3" /> {badge}
      </span>
    )}
    <div className="flex items-start justify-between mb-2">
      <div>
        <p className="font-semibold text-lg">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="text-2xl font-bold">{price !== null ? formatEur(price) : "—"}</p>
    </div>
    <ul className="space-y-1.5 mt-3">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    <div className="mt-3 flex items-center gap-2 text-sm">
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          selected ? "border-primary bg-primary" : "border-muted-foreground/40"
        }`}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      <span className={selected ? "text-primary font-medium" : "text-muted-foreground"}>
        {selected ? "I zgjedhur" : "Zgjidh"}
      </span>
    </div>
  </button>
);

export default PaymentJobPosting;
