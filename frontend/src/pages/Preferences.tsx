import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, CheckCircle, XCircle } from "lucide-react";

// Construct API URL safely — handle both with and without /api suffix
const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const apiUrl = rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`;

const JOB_CATEGORIES = [
  "Teknologji",
  "Marketing",
  "Shitje",
  "Financë",
  "Burime Njerëzore",
  "Inxhinieri",
  "Dizajn",
  "Menaxhim",
  "Shëndetësi",
  "Arsim",
  "Turizëm",
  "Ndërtim",
  "Transport",
  "Tjetër",
];

interface QuickUserPreferences {
  emailNotifications: boolean;
  interests: string[];
}

const Preferences = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    token ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Lidhja nuk është e vlefshme. Mungon token-i."
  );
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<QuickUserPreferences>({
    emailNotifications: true,
    interests: [],
  });

  useEffect(() => {
    if (!token) return;

    fetch(`${apiUrl}/quickusers/preferences?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setPreferences({
            emailNotifications: data.data?.emailNotifications ?? true,
            interests: data.data?.interests ?? [],
          });
          setStatus("ready");
        } else {
          const data = await res.json().catch(() => null);
          setErrorMessage(
            data?.message || "Nuk mund të ngarkoheshin preferencat."
          );
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMessage(
          "Nuk mund të lidheshim me serverin. Provoni përsëri më vonë."
        );
        setStatus("error");
      });
  }, [token]);

  const toggleInterest = (category: string) => {
    setPreferences((prev) => ({
      ...prev,
      interests: prev.interests.includes(category)
        ? prev.interests.filter((c) => c !== category)
        : [...prev.interests, category],
    }));
  };

  const handleSave = async () => {
    if (!token) return;

    setSaving(true);
    try {
      const res = await fetch(
        `${apiUrl}/quickusers/preferences?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailNotifications: preferences.emailNotifications,
            interests: preferences.interests,
          }),
        }
      );

      const data = await res.json().catch(() => null);

      if (res.ok) {
        toast({
          title: "Sukses",
          description:
            data?.message || "Preferencat u ruajtën me sukses.",
        });
      } else {
        toast({
          title: "Gabim",
          description:
            data?.message || "Nuk mund të ruhen preferencat. Provoni përsëri.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Gabim",
        description:
          "Nuk mund të lidheshim me serverin. Provoni përsëri më vonë.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Error state — missing token or fetch failure
  if (status === "error") {
    return (
      <>
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
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // Loading state
  if (status === "loading") {
    return (
      <>
        <Navigation />
        <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>Preferencat e Njoftimeve</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">
                Duke ngarkuar preferencat tuaja...
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // Ready state — show preference controls
  return (
    <>
      <Navigation />
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4 py-8">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Settings className="h-6 w-6" />
              Preferencat e Njoftimeve
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Menaxhoni cilësimet e njoftimeve tuaja me email.
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Email notifications toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor="email-notifications"
                  className="text-base font-medium"
                >
                  Njoftimet me email
                </Label>
                <p className="text-sm text-muted-foreground">
                  Merrni njoftime për punë të reja që përputhen me interesat
                  tuaja.
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={preferences.emailNotifications}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({
                    ...prev,
                    emailNotifications: checked,
                  }))
                }
              />
            </div>

            {/* Interests checkboxes */}
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Kategoritë e punës që ju interesojnë
              </Label>
              <p className="text-sm text-muted-foreground">
                Zgjidhni kategoritë për të cilat dëshironi të merrni njoftime.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {JOB_CATEGORIES.map((category) => (
                  <div key={category} className="flex items-center space-x-2">
                    <Checkbox
                      id={`interest-${category}`}
                      checked={preferences.interests.includes(category)}
                      onCheckedChange={() => toggleInterest(category)}
                    />
                    <Label
                      htmlFor={`interest-${category}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {category}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Save button */}
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duke ruajtur...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Ruaj Preferencat
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Preferences;
