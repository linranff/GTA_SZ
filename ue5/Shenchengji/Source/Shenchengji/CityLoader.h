#pragma once

#include "CoreMinimal.h"
#include "CityTypes.h"
#include "Dom/JsonObject.h"

struct SHENCHENGJI_API FShenchengjiCityLoader
{
	static FString SkeletonPath();
	static FString StoryPath();
	static FString ContentFile(const TCHAR* Relative);
	static bool LoadSkeleton(FShenchengjiCitySkeleton& OutSkeleton, FString& OutError);
	static TSharedPtr<FJsonObject> ReadJsonFile(const FString& Path, FString& OutError);
};
