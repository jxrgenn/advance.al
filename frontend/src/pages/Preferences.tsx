import Navigation from "@/components/Navigation";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, CheckCircle, XCircle, Info } from "lucide-react";
import { JOB_CATEGORIES } from "@/constants/jobCategories";
import {
  quickUsersApi,
  ApiError,
  type QuickUserPreferences,
  type QuickUserEmailFrequency,
} from "@/lib/api";

// What each frequency really does (backend: QuickUser.claimJobAlertSlot +
// the digest flush). Matches inside the gap are grouped, never dropped.
const FREQUENCY_OPTIONS: Array<{ value: QuickUserEmailFrequency; title: string; description: string }> = [
  {
    value: "immediate",
    title: "Menjëherë",
    description:
      "Një email sapo publikohet një punë që ju përshtatet. Maksimumi një email në orë — punët e tjera grupohen në emailin e radhës.",
  },
  {
    value: "daily",
    title: "Përmbledhje ditore",
    description: "Maksimumi një email në ditë, me të gjitha punët e reja që ju përshtaten.",
  },
  {
    value: "weekly",
    title: "Përmbledhje javore",
    description: "Maksimumi një email në javë, me të gjitha punët e reja që ju përshtaten.",
  },
];

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiError) return error.response?.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

type FormState = Pick<QuickUserPreferences, "emailNotifications" | "interests" | "emailFrequency">;

const sameForm = (a: FormState, b: FormState) =>
  a.emailNotifications === b.emailNotifications &&
  a.emailFrequency === b.emailFrequency &&
  a.interests.length === b.interests.length &&
  a.interests.every((i) => b.interests.includes(i));

const Preferences = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();

  const [status, setStatus] = useState<"loading" | "ready" | "error">(token ? "loading" : "error");
  const [errorText, setErrorText] = useState(token ? "" : "Lidhja nuk është e vlefshme. Mungon token-i.");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<QuickUserPreferences | null>(null);
  const [form, setForm] = useState<FormState>({ emailNotifications: true, interests: [], emailFrequency: "immediate" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    quickUsersApi
      .getPreferences(token)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setSaved(res.data);
          setForm({
            emailNotifications: res.data.emailNotifications,
            interests: res.data.interests,
            emailFrequency: res.data.emailFrequency,
          });
          setStatus("ready");
        } else {
          setErrorText(res.message || "Nuk mundën të ngarkoheshin preferencat.");
          setStatus("error");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorText(errorMessage(error, "Nuk mund të lidheshim me serverin. Provoni përsëri më vonë."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleInterest = (category: string) => {
    setSaveError("");
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(category)
        ? prev.interests.filter((c) => c !== category)
        : [...prev.interests, category],
    }));
  };

  const savedForm: FormState | null = saved
    ? { emailNotifications: saved.emailNotifications, interests: saved.interests, emailFrequency: saved.emailFrequency }
    : null;
  const legacyPending = (saved?.legacyInterests?.length ?? 0) > 0;
  const dirty = savedForm ? !sameForm(form, savedForm) || (legacyPending && form.emailNotifications) : false;
  const noInterest = form.emailNotifications && form.interests.length === 0;

  const handleSave = async () => {
    if (!token || !saved) return;
    if (noInterest) {
      setSaveError("Zgjidhni të paktën një kategori pune, ose çaktivizoni njoftimet me email.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      // When alerts are switched off only that change is sent: the other
      // fields keep their stored values for a later re-subscribe.
      const changes = form.emailNotifications
        ? { emailNotifications: true, interests: form.interests, emailFrequency: form.emailFrequency }
        : { emailNotifications: false };
      const res = await quickUsersApi.updatePreferences(token, changes);
      if (res.success && res.data) {
        setSaved(res.data);
        setForm({
          emailNotifications: res.data.emailNotifications,
          interests: res.data.interests,
          emailFrequency: res.data.emailFrequency,
        });
        toast({ title: "Sukses", description: res.message || "Preferencat u ruajtën me sukses." });
      } else {
        setSaveError(res.message || "Nuk mund të ruhen preferencat. Provoni përsëri.");
      }
    } catch (error) {
      setSaveError(errorMessage(error, "Nuk mund të ruhen preferencat. Provoni përsëri."));
    } finally {
      setSaving(false);
    }
  };

  if (status === "error") {
    return (
      <>
        <SEO title="Preferencat e njoftimeve" path="/preferences" noindex />
        <Navigation />
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <XCircle className="h-6 w-6 text-red-500" />
                Gabim
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-muted-foreground" data-testid="preferences-error">{errorText}</p>
              <Link to="/">
                <Button variant="outline">Kthehu në faqen kryesore</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (status === "loading" || !saved) {
    return (
      <>
        <SEO title="Preferencat e njoftimeve" path="/preferences" noindex />
        <Navigation />
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>Preferencat e Njoftimeve</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Duke ngarkuar preferencat tuaja...</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // The subscription was moved into a full account at registration: its
  // alerts are managed from the profile, not from this page.
  if (saved.convertedToFullUser) {
    return (
      <>
        <SEO title="Preferencat e njoftimeve" path="/preferences" noindex />
        <Navigation />
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Info className="h-6 w-6 text-blue-500" />
                Preferencat e Njoftimeve
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Ky abonim ({saved.email}) u kalua në llogarinë tuaj në advance.al. Njoftimet e punës i menaxhoni nga
                profili juaj.
              </p>
              <Link to="/profile">
                <Button>Shko te profili</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const disabled = !form.emailNotifications;

  return (
    <>
      <SEO title="Preferencat e njoftimeve" path="/preferences" noindex />
      <Navigation />
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Settings className="h-6 w-6" />
              Preferencat e Njoftimeve
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Përshëndetje {saved.firstName}! Këtu menaxhoni njoftimet me email për{" "}
              <span className="font-medium text-foreground">{saved.email}</span>.
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Email notifications on/off */}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications" className="text-base font-medium">
                  Njoftimet me email
                </Label>
                <p className="text-sm text-muted-foreground">
                  {form.emailNotifications
                    ? "Merrni email për punë të reja që përputhen me interesat tuaja."
                    : "Të çaktivizuara — nuk do të merrni email për punë të reja."}
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={form.emailNotifications}
                onCheckedChange={(checked) => {
                  setSaveError("");
                  setForm((prev) => ({ ...prev, emailNotifications: checked }));
                }}
              />
            </div>

            {/* Frequency */}
            <fieldset className={`space-y-3 ${disabled ? "opacity-50" : ""}`} disabled={disabled}>
              <legend className="text-base font-medium">Sa shpesh të merrni email?</legend>
              <RadioGroup
                value={form.emailFrequency}
                onValueChange={(value) => setForm((prev) => ({ ...prev, emailFrequency: value as QuickUserEmailFrequency }))}
                disabled={disabled}
                className="gap-3"
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`frequency-${option.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
                  >
                    <RadioGroupItem id={`frequency-${option.value}`} value={option.value} className="mt-0.5" />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">{option.title}</span>
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {saved.pendingDigestCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {saved.pendingDigestCount === 1
                    ? "1 punë e re pret emailin tuaj të radhës."
                    : `${saved.pendingDigestCount} punë të reja presin emailin tuaj të radhës.`}
                </p>
              )}
            </fieldset>

            {/* Interests */}
            <fieldset className={`space-y-3 ${disabled ? "opacity-50" : ""}`} disabled={disabled}>
              <legend className="text-base font-medium">Kategoritë e punës që ju interesojnë</legend>
              <p className="text-sm text-muted-foreground">Zgjidhni të paktën një kategori.</p>
              {legacyPending && (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {saved.legacyInterests.length === 1 ? "Kategoria" : "Kategoritë"} “{saved.legacyInterests.join("”, “")}”{" "}
                  {saved.legacyInterests.length === 1 ? "nuk ekziston" : "nuk ekzistojnë"} më në advance.al dhe do të{" "}
                  {saved.legacyInterests.length === 1 ? "hiqet" : "hiqen"} kur të ruani. Zgjidhni kategoritë e reja më
                  poshtë.
                </p>
              )}
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {JOB_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center space-x-2">
                    <Checkbox
                      id={`interest-${category}`}
                      checked={form.interests.includes(category)}
                      onCheckedChange={() => toggleInterest(category)}
                      disabled={disabled}
                    />
                    <Label htmlFor={`interest-${category}`} className="text-sm font-medium leading-none">
                      {category}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>

            {saveError && (
              <p className="text-sm text-red-600" role="alert" data-testid="preferences-save-error">
                {saveError}
              </p>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duke ruajtur...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {dirty ? "Ruaj Preferencat" : "Preferencat janë të ruajtura"}
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Dëshironi të mos merrni më asnjë email?{" "}
              <Link to={`/unsubscribe?token=${encodeURIComponent(token ?? "")}`} className="text-primary underline">
                Çregjistrohuni plotësisht
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Preferences;
