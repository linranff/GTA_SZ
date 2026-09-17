#pragma once

#include "CoreMinimal.h"
#include "CoordinateBridge.generated.h"

/** Babylon / 深城纪 game metres → Unreal centimeters. Game X=east, Z=north, Y=up. Unreal X=east, Y=north, Z=up. */
USTRUCT(BlueprintType)
struct SHENCHENGJI_API FShenchengjiCoordinateBridge
{
	GENERATED_BODY()

	static constexpr double CentimetersPerGameMeter = 100.0;
	static constexpr double OriginLon = 114.025;
	static constexpr double OriginLat = 22.536;
	static constexpr double LonMeters = 102850.0;
	static constexpr double LatMeters = 111320.0;
	static constexpr double HorizontalScale = 0.60;

	static FVector GameToUnreal(double GameX, double GameZ, double GameHeight = 0.0)
	{
		return FVector(GameX * CentimetersPerGameMeter, GameZ * CentimetersPerGameMeter, GameHeight * CentimetersPerGameMeter);
	}

	static void UnrealToGame(const FVector& UnrealCm, double& OutX, double& OutZ, double& OutHeight)
	{
		OutX = UnrealCm.X / CentimetersPerGameMeter;
		OutZ = UnrealCm.Y / CentimetersPerGameMeter;
		OutHeight = UnrealCm.Z / CentimetersPerGameMeter;
	}

	static FRotator GameYawToUnreal(double YawRadians)
	{
		return FRotator(0.0, 90.0 - FMath::RadiansToDegrees(YawRadians), 0.0);
	}

	static void Wgs84ToGame(double Lon, double Lat, double& OutX, double& OutZ)
	{
		OutX = (Lon - OriginLon) * LonMeters * HorizontalScale;
		OutZ = (Lat - OriginLat) * LatMeters * HorizontalScale;
	}
};
