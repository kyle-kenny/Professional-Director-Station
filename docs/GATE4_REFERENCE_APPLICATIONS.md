# Gate 4 Reference Application Validation Boundary

PDS emits standards-based interchange artifacts for external applications, but CI cannot assume licensed or heavyweight DCC applications are installed on hosted Windows/Linux runners. Therefore automated Gate 4 acceptance validates the standards-visible contracts that those applications consume: USDA header/stage metadata, OTIO frame timing, MaterialX 1.39 assignment identity, OCIO/ACES project metadata, stable URIs, and adapter-specific handoff manifests.

For studio deployment, the adapter manifest is the handoff checklist for Blender, Maya/MayaUSD, Houdini Solaris, Unreal Engine, Nuke, and DaVinci Resolve. Each reference application should be configured from the package color manifest before visual comparison. PDS never reports a successful in-application import unless that application has actually performed it; hosted CI proves deterministic interchange structure and PDS round-trip, not vendor-application installation.
