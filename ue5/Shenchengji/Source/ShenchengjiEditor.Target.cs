using UnrealBuildTool;
using System.Collections.Generic;

public class ShenchengjiEditorTarget : TargetRules
{
	public ShenchengjiEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
		ExtraModuleNames.AddRange(new string[] { "TP_VehicleAdv", "Shenchengji" });
	}
}
