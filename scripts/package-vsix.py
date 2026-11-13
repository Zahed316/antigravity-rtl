#!/usr/bin/env python3
"""Package antigravity-rtl into a standard .vsix archive without external tools."""

import json
import os
import xml.sax.saxutils as xml
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "package.json"), "r", encoding="utf-8") as f:
    pkg = json.load(f)

publisher = pkg["publisher"]
name = pkg["name"]
version = pkg["version"]
display_name = xml.escape(pkg.get("displayName", name))
description = xml.escape(pkg.get("description", ""))
out_path = os.path.join(ROOT, f"{name}-{version}.vsix")

CONTENT_TYPES = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".css" ContentType="text/css"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".png" ContentType="image/png"/>
  <Default Extension=".txt" ContentType="text/plain"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
"""

MANIFEST = f"""<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="{xml.escape(name)}" Version="{xml.escape(version)}" Publisher="{xml.escape(publisher)}"/>
    <DisplayName>{display_name}</DisplayName>
    <Description xml:space="preserve">{description}</Description>
    <Tags>rtl,ltr,persian,arabic,hebrew,urdu,antigravity</Tags>
    <Categories>Formatters,Other</Categories>
    <Icon>extension/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
  </Assets>
</PackageManifest>
"""

INCLUDE_FILES = [
    "package.json",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "icon.png",
    "extension.js",
    "src/proxy.js",
    "src/patcher.js",
    "src/client/rtl.css",
    "src/client/rtl-inject.js",
]

with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("[Content_Types].xml", CONTENT_TYPES)
    zf.writestr("extension.vsixmanifest", MANIFEST)
    for rel in INCLUDE_FILES:
        abs_path = os.path.join(ROOT, rel)
        zf.write(abs_path, os.path.join("extension", rel))

print(out_path)
