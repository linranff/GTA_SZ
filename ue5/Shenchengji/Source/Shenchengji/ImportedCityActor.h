#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ImportedCityActor.generated.h"

USTRUCT()
struct FShenchengjiImportedMesh
{
	GENERATED_BODY()

	FString Destination;
	FString Name;
	FVector Translation = FVector::ZeroVector;
	float Scale = 1.f;
};

UCLASS()
class SHENCHENGJI_API AShenchengjiImportedCityActor : public AActor
{
	GENERATED_BODY()

public:
	AShenchengjiImportedCityActor();

	UFUNCTION(BlueprintCallable, CallInEditor, Category = "深城纪")
	int32 BuildFromLayout();

	int32 GetSpawnedCount() const { return SpawnedCount; }

private:
	int32 SpawnedCount = 0;
};
