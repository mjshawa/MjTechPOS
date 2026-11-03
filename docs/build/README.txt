Rebuild the manuals (needs Node and the "docx" package: npm install docx):

  OUT_DIR=.. node staff.cjs
  OUT_DIR=.. node owner.cjs

The product name defaults to "MjTech Point Of Sale" (change with BRAND_NAME="...", files with FILE_PREFIX="...").
Open the .docx in Word and "Save as PDF" if you need PDFs, or just edit the .docx files directly.
