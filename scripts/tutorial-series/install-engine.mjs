// Reuse only authored film files. Never copy or alter the protected video scaffold.
import fs from 'node:fs';
import path from 'node:path';
const slug = process.argv[2];
const source = 'artifacts/patient-pipeline-ghl-forms';
const target = `artifacts/${slug}`;
const files = ['src/App.tsx', 'src/components/video/VideoTemplate.tsx', 'src/components/video/VideoWithControls.tsx',
  'src/components/video/Tutorial.css', 'src/components/video/video_scenes/TutorialScene.tsx'];
if (target !== source) for (const file of files) {
  fs.mkdirSync(path.dirname(`${target}/${file}`), {recursive:true});
  fs.copyFileSync(`${source}/${file}`, `${target}/${file}`);
}
const lesson = JSON.parse(fs.readFileSync(`${target}/src/components/video/lesson.json`, 'utf8'));
const html = fs.readFileSync(`${target}/index.html`, 'utf8').replaceAll('An animated video built with Replit.',
  `A complete beginner connection tutorial with narrated clicks, typing, and verification steps. External screens are labeled instructional recreations.`).replace('href="/favicon.svg"',`href="/${slug}/favicon.svg"`);
fs.writeFileSync(`${target}/index.html`,html);
fs.writeFileSync(`${target}/src/components/video/sceneMeta.ts`, `export interface SceneDetails { title: string; filePath: string }\nexport const SCENE_DETAILS: Record<string, SceneDetails> = ${JSON.stringify(Object.fromEntries(lesson.scenes.map(s=>[s.key,{title:s.title,filePath:'src/components/video/video_scenes/TutorialScene.tsx'}])),null,2)};\n`);
console.log(`Installed authored film engine for ${slug}; protected scaffold untouched.`);