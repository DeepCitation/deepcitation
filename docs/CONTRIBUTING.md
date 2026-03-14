---
layout: default
title: Contributing
nav_exclude: true
search_exclude: true
---

# Contributing to Documentation

Thank you for your interest in improving the DeepCitation documentation.

## Before You Open a PR

For anything beyond a typo fix, **open an issue first**. Describe what is wrong or missing and why it matters. This prevents duplicate effort and gives maintainers a chance to say whether the change is in scope before you write anything.

PRs without a linked issue (for non-trivial changes) will be closed and asked to start with an issue.

## Scope

Keep PRs small and targeted. One page, one concept, one problem per PR. If you find yourself touching three files to "improve clarity," you've lost the thread — pick the most important change and open separate issues for the rest.

**Do not rewrite or reformat pages where the content is already correct.** Restructuring prose, changing heading levels, or rewording accurate sentences is not a contribution. Only correct what is wrong or add what is missing.

## Accuracy

Every factual claim must be verifiable. In your PR description, state which source you checked — a specific TypeScript interface, a method signature in `src/`, a test, or the published package. "I ran it and it worked" is acceptable. "It seems like it should work" is not.

Code examples must come from a real session. Do not write examples from memory or let an AI generate them without running them. Invented method signatures or incorrect option names will be caught in review and the PR will be closed.

## On AI-Assisted Writing

Using AI to help draft or edit is fine. Submitting AI output you haven't carefully reviewed is not. You are responsible for every sentence you put in a PR. If a sentence is vague, hedges with "may" or "might," or exists only to fill space — delete it before submitting.

The fastest way to get a PR closed is a description that could have been written without reading the existing docs.

## Getting Started

### Prerequisites

- Ruby 3.2+
- Bundler

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/DeepCitation/deepcitation.git
   cd deepcitation/docs
   ```

2. Install dependencies:
   ```bash
   bundle install
   ```

3. Start the local server:
   ```bash
   bundle exec jekyll serve
   ```

4. Open [http://localhost:4000/](http://localhost:4000/) in your browser.

## Documentation Structure

```
docs/
├── _config.yml           # Jekyll configuration
├── index.md              # Home page
├── getting-started.md    # Installation guide
├── api-reference.md      # REST API docs
├── curl-guide.md         # Curl examples
├── types.md              # TypeScript interfaces
├── verification-statuses.md  # Status explanations
├── code-examples.md      # SDK usage patterns
├── components.md         # React component docs
├── real-world-examples.md    # Industry examples
├── styling.md            # CSS customization
└── 404.md                # 404 page
```

## Writing Guidelines

### Front Matter

Every markdown file needs front matter:

```yaml
---
layout: default
title: Page Title
nav_order: 1
description: "Brief description for SEO"
---
```

### Code Examples

Use fenced code blocks with language tags:

````markdown
```typescript
const deepcitation = new DeepCitation({ apiKey: "..." });
```
````

### Callouts

Use just-the-docs callouts:

```markdown
{: .note }
This is a note.

{: .warning }
This is a warning.

{: .highlight }
This is highlighted.
```

### Links

Link to other pages using the `site.baseurl` variable with trailing slashes:

```markdown
[Getting Started]({{ site.baseurl }}/getting-started/)
```

## Submitting Changes

1. Open an issue describing what is wrong or missing
2. Fork the repository and create a feature branch: `git checkout -b docs/my-improvement`
3. Make the smallest change that addresses the issue
4. Commit: `git commit -m "docs: Description of changes"`
5. Push and open a PR — link the issue and fill out the documentation section of the PR template

## Deployment

### GitHub Pages

Documentation is automatically deployed to GitHub Pages when changes are pushed to `main`:
- **URL:** `https://docs.deepcitation.com/`

### Custom Domain Setup

To use a custom domain (e.g., `docs.deepcitation.com`):

1. **Add CNAME file** to `docs/` directory:
   ```
   docs.deepcitation.com
   ```

2. **Configure DNS** with your domain provider:
   - For apex domain (`deepcitation.com`): Add `A` records pointing to GitHub's IPs:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```
   - For subdomain (`docs.deepcitation.com`): Add a `CNAME` record:
     ```
     docs.deepcitation.com -> deepcitation.github.io
     ```

3. **Update `_config.yml`**:
   ```yaml
   baseurl: ""  # Remove /deepcitation for custom domain
   url: "https://docs.deepcitation.com"
   ```

4. **Enable in GitHub Settings**:
   - Go to Settings > Pages
   - Enter your custom domain
   - Check "Enforce HTTPS"

### Preview PR Changes

When you open a PR with documentation changes:
1. The docs workflow builds and uploads an artifact
2. Download the `github-pages` artifact from the workflow run
3. Serve locally to preview:
   ```bash
   cd artifact && python -m http.server 8000
   ```

## Questions?

Open an issue or reach out at [support@deepcitation.com](mailto:support@deepcitation.com).
