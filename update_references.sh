#!/bin/bash

# Update all references from @google/gemini-cli-core to @super-young/gemini-cli-core
find packages -type f -exec sed -i 's/@google\/gemini-cli-core/@super-young\/gemini-cli-core/g' {} +

echo "References updated successfully"