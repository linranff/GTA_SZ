using UnrealBuildTool;
using System.Collections.Generic;

public class ShenchengjiTarget : TargetRules
{
	public ShenchengjiTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_5;
		ExtraModuleNames.AddRange(new string[] { "TP_VehicleAdv", "Shenchengji" });
	}
}
