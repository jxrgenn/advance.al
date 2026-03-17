import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSearchParams, Link } from "react-router-dom";
import { useState } from "react";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
// Ensure no double /api
const apiUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"confirm" | "loading" | "success" | "error">(
    token ? "confirm" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Lidhja e çregjistrimit nuk është e vlefshme. Mungon token-i."
  );

  const handleUnsubscribe = () => {
    if (!token) return;
    setStatus("loading");

    // Use POST to prevent email scanner auto-triggering
    fetch(`${apiUrl}/quickusers/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
        } else {
          const data = await res.json().catch(() => null);
          setErrorMessage(
            data?.message || "Ndodhi nje gabim gjate cregjistrimit."
          );
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMessage("Nuk mund te lidheshim me serverin. Provoni perseri me vone.");
        setStatus("error");
      });
  };

  return (
    <>
      <Navigation />
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Çregjistrimi nga Email-et</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 text-center">
            {status === "confirm" && (
              <>
                <Mail className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Jeni i sigurt që doni të çregjistroheni nga njoftimet me email?
                </p>
                <Button onClick={handleUnsubscribe} variant="destructive">
                  Po, çregjistrohu
                </Button>
              </>
            )}

            {status === "loading" && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">
                  Duke procesuar kerkesen tuaj...
                </p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold text-foreground">
                  U çregjistruat me sukses
                </p>
                <p className="text-sm text-muted-foreground">
                  Nuk do te merrni me email njoftime nga ne.
                </p>
              </>
            )}

            {status === "error" && (
              <>
                <XCircle className="h-12 w-12 text-red-500" />
                <p className="text-lg font-semibold text-foreground">
                  Çregjistrimi deshtoi
                </p>
                <p className="text-sm text-muted-foreground">
                  {errorMessage}
                </p>
              </>
            )}

            <Link to="/">
              <Button variant="outline" className="mt-2">
                Kthehu ne faqen kryesore
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Unsubscribe;
