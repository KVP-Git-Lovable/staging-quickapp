# Transfer: QuickApp AI port for bharath-sales-navigator (golive-cutover)

This branch exists only to carry one commit that this Claude session could not
push directly (the git proxy does not authorize bharath-sales-navigator).
It contains the commit "Port QuickApp AI module and AI cards from staging-quickapp"
(79 files, +11,682 / -5) built on top of golive-cutover commit `523c51f6`.

## How to apply (on your machine)

```bash
# 1. Get this transfer branch
git clone --depth 1 --branch claude/bharath-golive-port-transfer \
  https://github.com/KVP-Git-Lovable/staging-quickapp transfer

# 2. Get the target repo on the right branch
git clone https://github.com/KVP-Git-Lovable/bharath-sales-navigator
cd bharath-sales-navigator
git checkout golive-cutover      # must be at 523c51f6 or a descendant

# 3. Apply the commit exactly as authored (message + trailers preserved)
git am ../transfer/bharath-port.patch

# 4. Push
git push origin golive-cutover
```

Alternative to step 3 (identical result, uses the binary bundle):
```bash
git fetch ../transfer/bharath-port.bundle golive-cutover:port-import
git merge --ff-only port-import
```

After pushing, this transfer branch can be deleted:
```bash
git push origin --delete claude/bharath-golive-port-transfer
```
