import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { PUBLISHED_ARTICLES } from "../../api/_lib/articles/index.js";
import { BookOpen } from "lucide-react";

const Blog = () => {
  const articles = PUBLISHED_ARTICLES;
  const description =
    articles.length > 0
      ? `${articles.length} artikuj për karrierën, tregun e punës dhe këshilla praktike për kërkuesit e punës në Shqipëri.`
      : "Artikuj për karrierën, tregun e punës dhe këshilla praktike për kërkuesit e punës në Shqipëri.";

  return (
    <div className="relative bg-slate-50 selection:bg-blue-100 selection:text-blue-900 font-sans min-h-screen flex flex-col">
      <SEO
        title="Blog — këshilla karriere dhe tregu i punës"
        description={description}
        path="/blog"
      />
      <Navigation />

      <section className="pt-8 pb-12 bg-gradient-to-br from-primary/5 to-primary/10">
        <div className="container mx-auto px-4 text-center">
          <div className="bg-primary/10 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-6">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Blog</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{description}</p>
        </div>
      </section>

      <section className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          {articles.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              Së shpejti — artikuj të rinj në punë.
            </p>
          ) : (
            <ul className="space-y-6">
              {articles.map((a: any) => (
                <li key={a.slug} className="border-b border-border pb-6 last:border-b-0">
                  <Link to={`/blog/${a.slug}`} className="block hover:opacity-80 transition-opacity">
                    <h2 className="text-xl md:text-2xl font-bold mb-2 text-foreground">{a.title}</h2>
                    <p className="text-sm text-muted-foreground mb-2">
                      <time dateTime={a.datePublished}>{a.datePublished}</time>
                      {a.readMinutes ? ` · ${a.readMinutes} min lexim` : ""}
                    </p>
                    <p className="text-muted-foreground">{a.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
