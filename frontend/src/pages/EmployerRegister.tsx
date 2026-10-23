import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Mail, Lock, Eye, EyeOff, RefreshCw, ShieldCheck, ClipboardList, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";
import { useEmailAvailability } from "@/hooks/useEmailAvailability";
import {
  validateForm,
  employerSignupRules,
  formatValidationErrors,
  normalizeAlbanianPhone,
  cleanAlbanianPhoneInput,
} from "@/lib/formValidation";
import SEO from "@/components/SEO";
import { useListingPrices, formatEuro, LISTING_DURATION_DAYS } from "@/lib/pricing";

/**
 * Employer signup — SHORT form (client feedback + owner decision 2026-10-22):
 * first name, last name, company name, email, mobile, password, then the
 * emailed 6-digit code. City, industry, size, description and website are
 * filled in later in the dashboard ("Plotëso profilin e kompanisë") and are
 * required before the first job post (server gate on POST /api/jobs).
 */
const EmployerRegister = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { register, user } = useAuth();
  // Real list prices (what checkout charges) — server config, not hard-coded.
  const listingPrices = useListingPrices();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Redirect authenticated users
  useEffect(() => {
    if (user) {
      navigate(user.userType === 'employer' ? '/employer-dashboard' : '/', { replace: true });
    }
  }, [user, navigate]);

  // Form state — the six fields of the short signup
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const emailAvailability = useEmailAvailability();

  const values = () => ({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    companyName: companyName.trim(),
    email: email.trim(),
    phone,
    password,
  });

  const getRegistrationData = () => ({
    email: email.trim().toLowerCase(),
    password,
    userType: 'employer' as const,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    companyName: companyName.trim(),
    phone: normalizeAlbanianPhone(phone),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const check = validateForm(values(), employerSignupRules.account);
    if (!check.isValid) {
      toast({ title: 'Kontrolloni fushat', description: formatValidationErrors(check.errors), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      // Backstop for a user who never left the email field (onBlur is the
      // primary path) — never send a code to an address that is taken.
      if (emailAvailability.status === 'taken') {
        throw new Error('Ky email është tashmë i regjistruar. Provoni hyrjen.');
      }
      if (emailAvailability.status === 'idle') {
        const r = await authApi.checkEmail(email.trim());
        if (!r.available) throw new Error('Ky email është tashmë i regjistruar. Provoni hyrjen.');
      }

      const response = await authApi.initiateRegistration(getRegistrationData());
      if (response.success) {
        setVerificationEmail(email.trim().toLowerCase());
        setVerificationCode('');
        setVerificationOpen(true);
        setResendCooldown(60);
        toast({
          title: 'Kontrolloni email-in',
          description: `Kemi dërguar një kod verifikimi në ${email.trim()}`,
        });
      } else {
        throw new Error(response.message || 'Gabim gjatë dërgimit të kodit');
      }
    } catch (error: any) {
      const fieldErrors: string[] = Array.isArray(error?.response?.errors)
        ? error.response.errors.map((er: any) => er?.message).filter(Boolean)
        : [];
      toast({
        title: 'Gabim në regjistrim',
        description: fieldErrors.length ? fieldErrors.join(' · ') : (error?.message || 'Ndodhi një gabim. Ju lutemi provoni përsëri.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) return;
    try {
      setVerificationLoading(true);
      await register(verificationEmail, verificationCode);
      setVerificationOpen(false);
      toast({
        title: 'Mirësevini në advance.al!',
        description: 'Llogaria u krijua. Hapi i radhës: plotësoni profilin e kompanisë.',
      });
      navigate('/employer-dashboard');
    } catch (error: any) {
      toast({
        title: 'Gabim',
        description: error?.message || 'Kodi i gabuar. Provoni përsëri.',
        variant: 'destructive',
      });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    try {
      await authApi.initiateRegistration(getRegistrationData());
      setResendCooldown(60);
      setVerificationCode('');
      toast({ title: 'Kodi u ridërgua', description: 'Kontrolloni email-in tuaj' });
    } catch (error: any) {
      toast({ title: 'Gabim', description: error?.message || 'Nuk mund të ridërgohet kodi', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO noindex title="Regjistrohu si Punëdhënës" path="/employer-register" />
      <Navigation />

      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-8 px-4">
        <div className="w-full max-w-xl">
          <Card className="border-2 border-blue-200">
            <CardHeader className="text-center space-y-2">
              <CardTitle className="text-2xl">Regjistro Kompaninë</CardTitle>
              <CardDescription>
                Vetëm të dhënat bazë — profilin e kompanisë e plotësoni pas regjistrimit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate data-testid="employer-short-signup">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="first-name">Emri *</Label>
                    <Input
                      id="first-name"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      maxLength={50}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="last-name">Mbiemri *</Label>
                    <Input
                      id="last-name"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      maxLength={50}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="company-name">Emri i kompanisë *</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="company-name"
                      autoComplete="organization"
                      className="pl-10"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      maxLength={100}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="company-email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="company-email"
                      type="email"
                      autoComplete="email"
                      className="pl-10"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailAvailability.status !== 'idle') emailAvailability.reset();
                      }}
                      onBlur={() => emailAvailability.check(email)}
                      required
                      aria-invalid={emailAvailability.status === 'taken'}
                    />
                  </div>
                  {emailAvailability.status === 'taken' && (
                    <p className="text-sm text-red-600">
                      Ky email është tashmë i regjistruar.{' '}
                      <Link to="/login" className="underline font-medium">Hyni në llogari</Link>
                    </p>
                  )}
                  {emailAvailability.status === 'checking' && (
                    <p className="text-xs text-muted-foreground">Po kontrollojmë email-in…</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mobile">Numri i celularit *</Label>
                  <div className="flex items-stretch">
                    <span className="inline-flex shrink-0 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                      +355
                    </span>
                    <Input
                      id="mobile"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      className="flex-1 min-w-0 rounded-l-none"
                      placeholder="69 123 4567"
                      value={phone}
                      onChange={(e) => setPhone(cleanAlbanianPhoneInput(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Fjalëkalimi *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Fshih fjalëkalimin" : "Shfaq fjalëkalimin"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">8+ karaktere, 1 shkronjë e madhe, 1 e vogël, 1 numër</p>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading || emailAvailability.status === 'taken'}>
                  {isLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Duke dërguar kodin...
                    </>
                  ) : 'Krijo llogarinë'}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Duke krijuar llogarinë pranoni <Link to="/terms" className="underline">Kushtet</Link> dhe{' '}
                  <Link to="/privacy" className="underline">Politikën e Privatësisë</Link>.
                </p>
              </form>

              {/* What happens next — no fields, just expectations. */}
              <ol className="mt-6 space-y-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground" data-testid="register-next-steps">
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Konfirmoni email-in me kodin 6-shifror që ju dërgojmë.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Në panel plotësoni profilin e kompanisë — qytetin, industrinë dhe një përshkrim të shkurtër. Pa to nuk publikohet puna e parë.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Ekipi ynë verifikon kompaninë; mund të kyçeni menjëherë.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    Regjistrimi është falas. Paguani vetëm kur publikoni:{' '}
                    <strong className="text-foreground" data-testid="price-standard">
                      {listingPrices ? formatEuro(listingPrices.standard) : '… €'}
                    </strong>{' '}
                    / {LISTING_DURATION_DAYS} ditë (i promovuar{' '}
                    <span data-testid="price-promoted">{listingPrices ? formatEuro(listingPrices.promoted) : '… €'}</span>).
                  </span>
                </li>
              </ol>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Ke tashmë llogari? </span>
                <Link to="/login" className="text-primary hover:underline">
                  Kyçu këtu
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Email Verification Overlay */}
      {verificationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="verify-title">
          <Card className="w-full max-w-sm mx-4">
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                <Mail className="w-6 h-6 text-blue-600" aria-hidden="true" />
              </div>
              <h3 id="verify-title" className="text-lg font-semibold">Verifikoni Email-in</h3>
              <p className="text-sm text-muted-foreground">
                Kemi dërguar një kod 6-shifror në{' '}
                <span className="font-semibold text-blue-600">{verificationEmail}</span>
              </p>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                aria-label="Kodi i verifikimit"
                className="text-center text-2xl tracking-[0.5em] font-bold"
                value={verificationCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(val);
                }}
                autoFocus
              />
              <Button
                className="w-full"
                onClick={handleVerifyCode}
                disabled={verificationCode.length !== 6 || verificationLoading}
              >
                {verificationLoading ? 'Duke verifikuar...' : 'Verifiko & Krijo Llogarinë'}
              </Button>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground">Nuk e morët kodin?</span>
                <button
                  className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline flex items-center gap-1"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0}
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  {resendCooldown > 0 ? `Ridërgo (${resendCooldown}s)` : 'Ridërgo kodin'}
                </button>
              </div>
              <button
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setVerificationOpen(false)}
              >
                Anulo
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default EmployerRegister;
