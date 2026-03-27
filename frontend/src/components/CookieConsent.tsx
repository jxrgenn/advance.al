import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { usersApi } from "@/lib/api";

const CONSENT_KEY = "cookie-consent-accepted";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay so the banner slides in after mount
    const timer = setTimeout(() => {
      if (!localStorage.getItem(CONSENT_KEY)) {
        setVisible(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, "true");
    setVisible(false);

    // If the user is logged in, also record cookie consent server-side
    const token = localStorage.getItem("authToken");
    if (token) {
      usersApi.recordCookieConsent().catch(() => {
        // Non-critical — localStorage consent is the primary record for anonymous users
      });
    }
  };

  if (!visible) return null;

  return (
    <div
      className={
        "fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-500 ease-out " +
        (visible ? "translate-y-0" : "translate-y-full")
      }
    >
      <div className="bg-white border-t border-gray-200 shadow-lg px-4 py-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          <Cookie className="h-5 w-5 text-primary flex-shrink-0 hidden sm:block" />
          <p className="text-sm text-gray-600 text-center sm:text-left flex-1">
            Kjo faqe perdor cookies per funksionimin baze te platformes.{" "}
            <Link
              to="/privacy"
              className="text-primary hover:underline font-medium"
            >
              Politika e Privatesise
            </Link>
          </p>
          <button
            onClick={handleAccept}
            className="bg-primary text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            Pranoj
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
