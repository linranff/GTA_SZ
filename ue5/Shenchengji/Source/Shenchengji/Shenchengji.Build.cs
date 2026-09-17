using UnrealBuildTool;

public class Shenchengji : ModuleRules
{
	public Shenchengji(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"Json",
			"JsonUtilities",
			"UMG",
			"Slate",
			"SlateCore",
			"ChaosVehicles",
			"TP_VehicleAdv"
		});
	}
}
