import { Helmet } from "react-helmet-async";

const SITE_URL = "https://advance.al";
const SITE_NAME = "Advance.al";
const DEFAULT_TITLE = "Advance.al - Portal i Punës në Shqipëri";
const DEFAULT_DESCRIPTION =
  "Advance.al është portali kryesor i punës në Shqipëri. Gjeni punë në Tiranë, Durrës dhe të gjithë vendin. Kompani të verifikuara, pozicione ekskluzive dhe aplikim i lehtë.";
const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.jpeg`;

type SEOProps = {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const SEO = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image = DEFAULT_OG_IMAGE,
  type = "website",
  noindex = false,
  jsonLd,
}: SEOProps) => {
  const finalTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const canonical = path ? `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}` : SITE_URL + "/";
  const jsonLdArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{finalTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta
          name="robots"
          content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
        />
      )}
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="sq_AL" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={finalTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {jsonLdArray.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEO;
