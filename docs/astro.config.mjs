// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const base = 'obsidian-aloud-tts';
// https://astro.build/config
export default defineConfig({
	site: 'https://adrianlyjak.github.io',
	base: base,
	integrations: [
		starlight({
			title: 'Aloud TTS',
			logo: {
				src: './public/favicon.svg',
			},
			head: [
				{
					tag: 'script',
					attrs: {
						src: 'https://www.googletagmanager.com/gtag/js?id=G-9Q0LL14N1E',
						async: true,
					},
				},
				{
					tag: 'script',
					content: `
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'G-9Q0LL14N1E');
					`,
				},
			],
			customCss: [
				// Custom CSS for purple theme
				'./src/styles/custom.css',
			],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/adrianlyjak/obsidian-aloud-tts' }],
			sidebar: [
				{
					label: 'Getting Started',
					link: '/getting-started/',
				},
				{
					label: 'Features',
					autogenerate: { directory: 'features' },
				},
				{
					label: 'Configuration',
					link: '/configuration/',
				},
				{
					label: 'Customization',
					autogenerate: { directory: 'customization' },
				},
			],
		}),
	],
});
