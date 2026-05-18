import { Link, useParams, Navigate } from "react-router-dom";
import DOMPurify from "dompurify";
import SEO from "@/components/SEO";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ARTICLES_BY_SLUG } from "../../api/_lib/articles/index.js";
import { ChevronRight, Home } from "lucide-react";

const SITE_URL = "https://advance.al";

const BlogArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const article: any = slug ? (ARTICLES_BY_SLUG as any)[slug] : null;

  if (!article) {
    return <Navigate to="/blog" replace />;
  }

  const canonical = `${SITE_URL}/blog/${slug}`;

  const jsonLd: any[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.description,
      author: {
        "@type": "Organization",
        name: article.author || "Ekipi i advance.al",
        url: `${SITE_URL}/about`,
      },
      publisher: {
        "@type": "Organization",
        name: "Advance.al",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.jpeg` },
      },
      datePublished: article.datePublished,
      dateModified: article.dateModified || article.datePublished,
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      image: article.image || `${SITE_URL}/logo.jpeg`,
      inLanguage: "sq-AL",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Faqja kryesore", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: article.title, item: canonical },
      ],
    },
  ];

  if (Array.isArray(article.faq) && article.faq.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: article.faq.map((qa: { q: string; a: string }) => ({
        "@type": "Question",
        name: qa.q,
        acceptedAnswer: { "@type": "Answer", text: qa.a },
      })),
    });
  }

  return (
    <div className="relative bg-slate-50 selection:bg-blue-100 selection:text-blue-900 font-sans min-h-screen flex flex-col">
      <SEO
        title={article.title}
        description={article.description}
        path={`/blog/${slug}`}
        type="article"
        jsonLd={jsonLd}
      />
      <Navigation />

      <nav className="container mx-auto px-4 pt-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground inline-flex items-center gap-1">
          <Home className="h-3 w-3" /> Faqja kryesore
        </Link>
        <ChevronRight className="h-3 w-3 inline mx-1" />
        <Link to="/blog" className="hover:text-foreground">Blog</Link>
        <ChevronRight className="h-3 w-3 inline mx-1" />
        <span className="text-foreground line-clamp-1">{article.title}</span>
      </nav>

      <article className="flex-1 py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 text-foreground leading-tight">
              {article.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Publikuar: <time dateTime={article.datePublished}>{article.datePublished}</time>
              {article.dateModified && article.dateModified !== article.datePublished
                ? ` · Përditësuar: ${article.dateModified}`
                : ""}
              {" · "}Nga {article.author || "ekipi i advance.al"}
              {article.readMinutes ? ` · ${article.readMinutes} min lexim` : ""}
            </p>
          </header>

          {/* Pre-deploy audit (O-C): article.bodyHtml is currently static
              (committed in frontend/api/_lib/articles/*.js), but sanitizing
              at render time is defence-in-depth — protects against any
              future path that lets attackers control article content
              (admin editor, user contributions, etc.). DOMPurify with an
              allowlist is byte-safe for already-clean HTML, so output is
              visually identical today. */}
          <div
            className="prose prose-slate max-w-none prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:leading-relaxed prose-a:text-primary prose-a:underline hover:prose-a:opacity-80 prose-li:my-1 prose-ul:my-4"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(article.bodyHtml, {
                ALLOWED_TAGS: [
                  "p", "h1", "h2", "h3", "h4", "h5", "h6",
                  "ul", "ol", "li",
                  "a", "strong", "em", "code", "pre", "blockquote",
                  "br", "hr", "img",
                  "table", "thead", "tbody", "tr", "th", "td",
                ],
                ALLOWED_ATTR: ["href", "src", "alt", "title", "rel", "target"],
                ADD_ATTR: ["target"],
                // Force outbound link safety
                FORBID_ATTR: ["style", "onclick", "onerror", "onload"],
              }),
            }}
          />

          <hr className="my-12 border-border" />

          <footer className="text-sm text-muted-foreground space-y-3">
            <p>
              <strong>Nga ekipi i advance.al</strong> — platforma që ndihmon shqiptarët të gjejnë
              punën e duhur. <Link to="/jobs" className="text-primary underline">Shfletoni pozicionet aktive</Link>.
            </p>
            {article.disclaimer && (
              <p className="text-xs italic border-l-2 border-border pl-3">
                {article.disclaimer}
              </p>
            )}
          </footer>
        </div>
      </article>

      <Footer />
    </div>
  );
};

export default BlogArticle;
