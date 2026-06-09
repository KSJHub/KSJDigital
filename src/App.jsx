import { useEffect, useState } from 'react';

import { client } from './lib/sanity';
import { fallbackProjects, fallbackServices } from './data/siteContent';
import Navbar from './components/layout/Navbar';
import Hero from './sections/Hero';
import Services from './sections/Services';
import Projects from './sections/Projects';
import Systems from './sections/Systems';
import Contact from './sections/Contact';

function App() {
  const [services, setServices] = useState(fallbackServices);
  const [projects, setProjects] = useState(fallbackProjects);

  useEffect(() => {
    async function loadContent() {
      try {
        const [serviceData, projectData] = await Promise.all([
          client.fetch(`*[_type == "service"] | order(_createdAt asc) {
            _id,
            title,
            description
          }`),
          client.fetch(`*[_type == "project"] | order(_createdAt asc) {
            _id,
            title,
            type,
            description,
            image
          }`),
        ]);

        if (serviceData?.length) setServices(serviceData);
        if (projectData?.length) setProjects(projectData);
      } catch (error) {
        console.error('Sanity content failed to load:', error);
      }
    }

    loadContent();
  }, []);

  return (
    <main className="site">
      <Navbar />
      <Hero />
      <Services services={services} />
      <Projects projects={projects} />
      <Systems />
      <Contact />
    </main>
  );
}

export default App;
