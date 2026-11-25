---
roleHint: "Scope: English AI-chat handoff residue, author-facing instructions, and unreplaced placeholder entities."
rules:
  - id: implicit-assistant-framing
    priority: strong
  - id: disguised-placeholder-prose
    priority: strong
  - id: synthetic-example-entity
    priority: moderate
---

1. **implicit-assistant-framing**: Fires on conversational openers or sign-offs that address the prompt author rather than the document's intended reader (e.g., 'Based on the notes you shared, I have organized...', 'Below is a breakdown tailored to your audience.', 'Let me know if you want a shorter version.'). Do not flag genuine first-person author introductions addressed to readers. Fix suggestion: remove the assistant handoff sentence.
2. **disguised-placeholder-prose**: Fires on prose sentences written as reminders to the writer rather than finished reader-facing copy (e.g., 'Mention the Q3 churn rate once finance confirms.', 'Include a link to the staging dashboard here.'). Fix suggestion: supply the confirmed figure or link before publishing, or omit the unfinished line.
3. **synthetic-example-entity**: Fires on unreplaced stock dummy names, companies, or addresses ('Acme Corp', 'WidgetCo', 'john.doe@example.com', '123 Main St') inside real deliverables. Do not flag API documentation, test tutorials, or RFC examples where placeholder domains are intentional. Fix suggestion: replace with the real organization or contact details.
