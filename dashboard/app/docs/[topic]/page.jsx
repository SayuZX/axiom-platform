import { notFound } from 'next/navigation';
import Docs from '../Docs';
import { topics } from '../topics.mjs';

export function generateStaticParams() {
  return topics.map(topic => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }) {
  const { topic: slug } = await params;
  const topic = topics.find(item => item.slug === slug);
  return { title: `${topic?.title || 'Dokumentasi'} — AXIOM AI`, description: topic?.description };
}

export default async function TopicPage({ params }) {
  const { topic: slug } = await params;
  if (!topics.some(topic => topic.slug === slug)) notFound();
  return <Docs key={slug} slug={slug}/>;
}
