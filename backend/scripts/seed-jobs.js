// Seeding script for Albanian job postings
// Run with: node scripts/seed-jobs.js

const additionalJobs = [
  {
    _id: "9",
    title: "Backend Developer",
    company: "ServerPro Albania",
    description: "Backend developer me përvojë në Node.js dhe Python për sisteme të mëdha të bazës së të dhënave.",
    requirements: ["Node.js", "Python", "MongoDB", "API Design"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 900, max: 1300, currency: "EUR" },
    benefits: ["Sigurim shëndetësor", "Bonus vjetor", "Laptop i ri"],
    postedAt: "2024-01-17T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "1 ditë më parë",
    applicationCount: 18,
    viewCount: 95
  },
  {
    _id: "10",
    title: "DevOps Engineer",
    company: "CloudTech Solutions",
    description: "DevOps engineer për të menaxhuar infrastrukturën cloud dhe proceset e deployment-it.",
    requirements: ["AWS", "Docker", "Kubernetes", "CI/CD"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 1100, max: 1600, currency: "EUR" },
    benefits: ["Training AWS", "Certifikime", "Bonus performance"],
    postedAt: "2024-01-16T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "2 ditë më parë",
    applicationCount: 12,
    viewCount: 78
  },
  {
    _id: "11",
    title: "Data Scientist",
    company: "Analytics Hub",
    description: "Data scientist për analiza të avancuara dhe machine learning në projekte të mëdha.",
    requirements: ["Python", "R", "Machine Learning", "SQL"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 1200, max: 1800, currency: "EUR" },
    benefits: ["Fleksibilitet pune", "Budget për kurse", "Equipment modern"],
    postedAt: "2024-01-15T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "3 ditë më parë",
    applicationCount: 8,
    viewCount: 65
  },
  {
    _id: "12",
    title: "Product Manager",
    company: "Innovation Labs",
    description: "Product manager për të drejtuar zhvillimin e produkteve teknologjike dhe strategjinë e tregut.",
    requirements: ["Product Strategy", "Agile", "Analytics", "Leadership"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Menaxhim",
    salary: { min: 1000, max: 1500, currency: "EUR" },
    benefits: ["Equity", "Makinë kompanie", "Health insurance"],
    postedAt: "2024-01-14T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "4 ditë më parë",
    applicationCount: 22,
    viewCount: 145
  },
  {
    _id: "13",
    title: "Cyber Security Specialist",
    company: "SecureNet Albania",
    description: "Specialist sigurie kibernetike për të mbrojtur sistemet dhe të dhënat e kompanisë.",
    requirements: ["Network Security", "Penetration Testing", "CISSP", "Risk Assessment"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 1300, max: 1900, currency: "EUR" },
    benefits: ["Certifikime të paguara", "Bonus sigurie", "Training ndërkombëtar"],
    postedAt: "2024-01-13T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "5 ditë më parë",
    applicationCount: 15,
    viewCount: 89
  },
  {
    _id: "14",
    title: "Digital Marketing Manager",
    company: "Growth Agency",
    description: "Digital marketing manager për të drejtuar strategjitë e marketingut digjital dhe fushatat e brandeve.",
    requirements: ["Google Ads", "Facebook Marketing", "SEO", "Analytics"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Marketing",
    salary: { min: 800, max: 1200, currency: "EUR" },
    benefits: ["Bonus rezultatesh", "Training Google", "Fleksibilitet orari"],
    postedAt: "2024-01-12T10:00:00Z",
    isActive: true,
    isSponsored: true,
    timeAgo: "6 ditë më parë",
    applicationCount: 28,
    viewCount: 156
  },
  {
    _id: "15",
    title: "Sales Representative",
    company: "MegaCorp",
    description: "Përfaqësues shitjesh për të zgjeruar bazën e klientëve dhe për të arritur objektivat e shitjeve.",
    requirements: ["Përvojë shitjesh", "Komunikim", "CRM", "Negocim"],
    location: { city: "Durrës", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Shitje",
    salary: { min: 600, max: 1000, currency: "EUR" },
    benefits: ["Komision i lartë", "Makinë", "Telefon kompanie"],
    postedAt: "2024-01-11T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 35,
    viewCount: 201
  },
  {
    _id: "16",
    title: "HR Specialist",
    company: "People First",
    description: "HR specialist për rekrutim, trajnim dhe menaxhimin e burimeve njerëzore në kompani.",
    requirements: ["HR Management", "Rekrutim", "Training", "Labor Law"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Part-time",
    category: "Administrata",
    salary: { min: 400, max: 700, currency: "EUR" },
    benefits: ["Orar fleksibël", "Training HR", "Networking events"],
    postedAt: "2024-01-10T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 19,
    viewCount: 123
  },
  {
    _id: "17",
    title: "Financial Analyst",
    company: "Investment Group",
    description: "Analist financiar për analiza të investimeve dhe raportim financiar për portofolio të kompanisë.",
    requirements: ["Financial Modeling", "Excel Advanced", "CFA", "Risk Analysis"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Financa",
    salary: { min: 800, max: 1100, currency: "EUR" },
    benefits: ["Bonus performance", "Training CFA", "Segurim jetë"],
    postedAt: "2024-01-09T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 14,
    viewCount: 87
  },
  {
    _id: "18",
    title: "Content Creator",
    company: "Media House",
    description: "Content creator për të krijuar përmbajtje tërheqëse për platformat sociale dhe website.",
    requirements: ["Video Editing", "Photoshop", "Social Media", "Storytelling"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Nga Shtëpia",
    category: "Media",
    salary: { min: 500, max: 800, currency: "EUR" },
    benefits: ["Punë remote", "Equipment", "Creative freedom"],
    postedAt: "2024-01-08T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 42,
    viewCount: 234
  },
  {
    _id: "19",
    title: "Software Tester",
    company: "QualityFirst",
    description: "Software tester për testimin e aplikacioneve dhe sigurimin e cilësisë së produkteve software.",
    requirements: ["Manual Testing", "Automation", "Selenium", "Bug Tracking"],
    location: { city: "Tiranë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Teknologji",
    salary: { min: 600, max: 900, currency: "EUR" },
    benefits: ["Training automation", "Certifikime", "Bonus cilësie"],
    postedAt: "2024-01-07T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 26,
    viewCount: 145
  },
  {
    _id: "20",
    title: "Project Manager",
    company: "BuildCorp",
    description: "Project manager për menaxhimin e projekteve të ndërtimit dhe koordinimin e ekipeve.",
    requirements: ["Project Management", "PMP", "Construction", "Leadership"],
    location: { city: "Vlorë", country: "Shqipëri" },
    jobType: "Full-time",
    category: "Ndërtim",
    salary: { min: 900, max: 1300, currency: "EUR" },
    benefits: ["Makinë kompanie", "Bonus projekti", "Sigurim plotë"],
    postedAt: "2024-01-06T10:00:00Z",
    isActive: true,
    isSponsored: false,
    timeAgo: "1 javë më parë",
    applicationCount: 17,
    viewCount: 98
  }
];

// Function to merge new jobs with existing ones
function seedJobs() {
  console.log('🌱 Seeding additional jobs...');
  console.log(`📊 Adding ${additionalJobs.length} new jobs to the database`);

  // This would typically integrate with your backend API
  // For now, we'll export the jobs to be used in the frontend

  const sponsoredJobs = additionalJobs.filter(job => job.isSponsored);
  console.log(`⭐ Found ${sponsoredJobs.length} sponsored jobs`);

  console.log('✅ Seeding completed!');
  console.log('📝 Copy the additionalJobs array to your Index.tsx file to test the carousel');

  return additionalJobs;
}


  seedJobs();