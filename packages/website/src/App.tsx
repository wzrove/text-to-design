import { onMount } from 'solid-js';
import Footer from './components/Footer';
import Header from './components/Header';
import Hero from './components/Hero';
import Install from './components/Install';
import Platforms from './components/Platforms';
import { RELEASES_URL, REPO_URL } from './content';
import { initReveal } from './motion';

export default function App() {
  onMount(initReveal);

  return (
    <div class="min-h-screen bg-ink">
      <Header releasesUrl={RELEASES_URL} repoUrl={REPO_URL} />
      <main>
        <Hero releasesUrl={RELEASES_URL} repoUrl={REPO_URL} />
        <Platforms releasesUrl={RELEASES_URL} />
        <Install releasesUrl={RELEASES_URL} />
      </main>
      <Footer />
    </div>
  );
}
