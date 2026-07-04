# Persona preset exports

Generated JSON snapshots of each target-market persona population, for
inspection and for downstream training-data work. Regenerate with:

```bash
python scripts/seed_personas.py            # 100 personas per preset
python scripts/seed_personas.py --count 1000
```

The source of truth for preset definitions is
`apps/api/app/services/persona/presets.py` (trait distributions, sub-segments,
dealbreaker pools). These exports are derived artifacts.
