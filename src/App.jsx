import { useEffect, useState } from 'react';

import { client } from './lib/sanity';
import { fallbackProjects, fallbackServices } from './data/siteContent';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Hero from './sections/Hero';
import Services from './sections/Services';
import Pricing from './sections/Pricing';
import Projects from './sections/Projects';
import Systems from './sections/Systems';
import Infrastructure from './sections/Infrastructure';
import Contact from './sections/Contact';

function App() {
  const [services, setServices] = useState(fallbackServices);
  const [projects, setProjects] = useState(fallbackProjects);

  useEffect(() => {
    async function loadContent() {
      const [serviceData, projectData] = await Promise.all([
        client.fetch('*[_type == "service"] | order(_createdAt asc) { _id, title, description }'),
        client.fetch('*[_type == "project"] | order(_createdAt asc) { _id, title, type, description, image }'),
      ]);

      if (serviceData?.length) setServices(serviceData);
      if (projectData?.length) setProjects(projectData);
    }

    loadContent().catch(() => {});
  }, []);

  return (
    <main className="site">
      <Navbar />
      <Hero />
      <Services services={services} />
      <Pricing />
      <Projects projects={projects} />
      <Systems />
      <Infrastructure />
      <Contact />
      <Footer />
    </main>
  );
}

export default App;
