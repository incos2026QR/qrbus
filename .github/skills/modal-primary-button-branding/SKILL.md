---
name: modal-primary-button-branding
description: "Apply QR Pago Justo branding to primary buttons in dialogs and modals. Use when creating or updating a modal's main action button, such as Descargar, Guardar, Confirmar, or Continuar."
---

# Modal Primary Button Branding

Use the QR Pago Justo brand palette for primary modal actions.

## Button colors

- Background: `bg-brand-blue`
- Text: `text-white`
- Hover background: `hover:bg-brand-blue-dark`
- Keyboard focus ring: `focus-visible:ring-brand-orange`

Apply these classes directly to the primary button, preserving its existing layout, sizing, disabled state, handler, and accessible label. Keep secondary, outline, destructive, and icon-only buttons on their existing variants.

Example:

```tsx
<Button className="bg-brand-blue text-white hover:bg-brand-blue-dark focus-visible:ring-brand-orange">
  Confirmar
</Button>
```

The brand color tokens are defined in `src/styles.css` and exposed as Tailwind classes.
